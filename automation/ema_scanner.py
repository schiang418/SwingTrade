#!/usr/bin/env python3
"""
EMA Scanner Automation: Unlock StockCharts chartlists, run 20-day EMA pullback scan,
download CSV results and CandleGlance screenshots.

Usage:
  python ema_scanner.py \
    --sc-username EMAIL --sc-password PASS \
    --leading-url URL --leading-password PASS \
    --hot-url URL --hot-password PASS \
    --data-dir /data

Outputs JSON to stdout with results.
"""

import argparse
import csv
import json
import os
import re
import shutil
import sys
import time
import glob as globmod
from datetime import datetime
from zoneinfo import ZoneInfo

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait, Select
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.common.exceptions import TimeoutException, NoSuchElementException


def log(msg, level="INFO"):
    print(f"[{datetime.now().isoformat()}] [{level}] {msg}", file=sys.stderr)


# 20-day EMA pullback scan criteria
EMA_SCAN_CRITERIA = (
    "[SCTR >75]\n"
    "AND [Daily Open > Daily EMA(20,Daily Close)]\n"
    "AND [Daily Low < Daily EMA(20,Daily Close)]\n"
    "AND [Daily Close > Daily EMA(20,Daily Close)]"
)


def get_eastern_date():
    """Get current date in US Eastern timezone as YYYY-MM-DD."""
    return datetime.now(ZoneInfo("America/New_York")).strftime("%Y-%m-%d")


def setup_driver(download_dir):
    chrome_options = Options()
    chrome_options.add_argument("--headless=new")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--window-size=1920,1200")
    chrome_options.add_argument("--disable-blink-features=AutomationControlled")
    chrome_options.add_argument("--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
    chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
    chrome_options.add_experimental_option("useAutomationExtension", False)
    chrome_options.add_experimental_option("prefs", {
        "download.default_directory": download_dir,
        "download.prompt_for_download": False,
        "download.directory_upgrade": True,
        "safebrowsing.enabled": True,
    })

    try:
        driver = webdriver.Chrome(options=chrome_options)
    except Exception:
        service = Service("/usr/bin/chromedriver")
        driver = webdriver.Chrome(service=service, options=chrome_options)

    driver.execute_cdp_cmd("Page.setDownloadBehavior", {
        "behavior": "allow",
        "downloadPath": download_dir,
    })

    return driver


def dismiss_overlays(driver):
    """Dismiss cookie banners and other overlays."""
    try:
        accept_btn = driver.find_element(By.XPATH, "//button[contains(text(), 'Accept')]")
        if accept_btn.is_displayed():
            driver.execute_script("arguments[0].click();", accept_btn)
            time.sleep(1)
    except Exception:
        pass

    try:
        driver.execute_script("""
            var banners = document.querySelectorAll(
                '[class*="cookie"], [class*="privacy"], .modal-backdrop, [class*="consent"]'
            );
            banners.forEach(function(el) { el.style.display = 'none'; el.remove(); });
        """)
    except Exception:
        pass


def unlock_chartlist(driver, sc_url, chartlist_password):
    """Navigate to shared chart URL, unlock with password, and save to ChartList.
    Returns the chartlist name extracted from the page title."""
    log(f"Navigating to shared chart URL: {sc_url}")
    driver.get(sc_url)
    time.sleep(5)

    log(f"Current URL after navigation: {driver.current_url}")

    # Handle password modal
    try:
        short_wait = WebDriverWait(driver, 8)
        password_modal = None

        # Try multiple modal selectors
        for selector in [
            (By.CSS_SELECTOR, ".modal.fade.in, .modal.show, div[role='dialog']"),
            (By.ID, "password-modal"),
            (By.XPATH, "//div[contains(@class, 'modal') and contains(@style, 'display: block')]"),
        ]:
            try:
                password_modal = short_wait.until(EC.visibility_of_element_located(selector))
                if password_modal:
                    log("Found password modal")
                    break
            except (TimeoutException, NoSuchElementException):
                continue

        if password_modal:
            # Enter password
            pwd_field = password_modal.find_element(By.CSS_SELECTOR, "input[type='password'], input[name='password']")
            pwd_field.clear()
            pwd_field.send_keys(chartlist_password)
            log("Entered chartlist password")

            # Click unlock button
            unlock_btn = None
            for sel in [
                (By.XPATH, ".//button[contains(text(), 'Unlock')]"),
                (By.CSS_SELECTOR, "button.btn-primary"),
                (By.CSS_SELECTOR, "button[type='submit']"),
                (By.ID, "button-password"),
            ]:
                try:
                    unlock_btn = password_modal.find_element(*sel)
                    break
                except NoSuchElementException:
                    continue

            if unlock_btn:
                driver.execute_script("arguments[0].click();", unlock_btn)
                log("Clicked unlock button")
                time.sleep(3)
            else:
                log("Could not find unlock button", "ERROR")
                return None
        else:
            log("No password modal found - chartlist may already be unlocked")
    except Exception as e:
        log(f"Error handling password modal: {e}", "WARNING")

    # Extract chartlist name from page title
    page_title = driver.title
    log(f"Page title: {page_title}")
    if " | " in page_title:
        chartlist_name = page_title.split(" | ")[0].strip()
    else:
        chartlist_name = page_title.strip()

    log(f"Extracted chartlist name: {chartlist_name}")

    # Save the chartlist to StockCharts account
    save_chartlist(driver, chartlist_password)

    return chartlist_name


def save_chartlist(driver, chartlist_password):
    """Click 'Save to ChartList' button and save the chartlist."""
    # Check if save-modal is already open
    try:
        save_modal = driver.find_element(By.ID, "save-modal")
        if save_modal.is_displayed():
            log("Save modal already open")
            _click_save_results(driver, save_modal)
            return
    except Exception:
        pass

    # Check for password-modal (re-locked after navigation)
    try:
        pwd_modal = driver.find_element(By.ID, "password-modal")
        if pwd_modal.is_displayed():
            log("Password modal appeared again, re-unlocking...")
            pwd_field = pwd_modal.find_element(By.CSS_SELECTOR, "input[type='password']")
            pwd_field.clear()
            pwd_field.send_keys(chartlist_password)
            unlock_btn = pwd_modal.find_element(By.CSS_SELECTOR, "button[type='submit'], button#button-password")
            unlock_btn.click()
            time.sleep(3)
    except Exception:
        pass

    # Click "Save to ChartList" button on page
    try:
        save_btn = None
        for sel in [
            (By.XPATH, "//button[contains(text(), 'Save to ChartList')]"),
            (By.CSS_SELECTOR, "button.btn-success, a.btn-success"),
            (By.XPATH, "//div[contains(@class, 'member-actions')]//button[contains(text(), 'Save')]"),
        ]:
            try:
                save_btn = WebDriverWait(driver, 5).until(EC.element_to_be_clickable(sel))
                break
            except (TimeoutException, NoSuchElementException):
                continue

        if save_btn:
            driver.execute_script("arguments[0].click();", save_btn)
            log("Clicked 'Save to ChartList' button")
            time.sleep(2)

            # Wait for save modal
            try:
                modal = WebDriverWait(driver, 5).until(
                    EC.presence_of_element_located((By.CSS_SELECTOR, "div.modal-content, div[role='dialog']"))
                )
                _click_save_results(driver, modal)
            except TimeoutException:
                log("Save modal did not appear after clicking save button", "WARNING")
        else:
            log("Could not find 'Save to ChartList' button - may already be saved", "WARNING")
    except Exception as e:
        log(f"Error saving chartlist: {e}", "WARNING")


def _click_save_results(driver, modal):
    """Click the Save Results button in the save modal."""
    try:
        save_results_btn = None
        for sel in [
            (By.ID, "save-chartlist"),
            (By.CSS_SELECTOR, "button.btn-green.btn-rounded"),
            (By.XPATH, ".//button[contains(text(), 'Save Results')]"),
        ]:
            try:
                save_results_btn = modal.find_element(*sel)
                break
            except NoSuchElementException:
                continue

        if save_results_btn:
            driver.execute_script("arguments[0].click();", save_results_btn)
            log("Clicked Save Results button")
            time.sleep(3)
        else:
            log("Could not find Save Results button in modal", "WARNING")
    except Exception as e:
        log(f"Error clicking Save Results: {e}", "WARNING")


def login_stockcharts(driver, email, password):
    """Login to StockCharts."""
    log("Logging into StockCharts...")
    driver.get("https://stockcharts.com/login")
    time.sleep(3)

    # Check if already logged in
    if "login" not in driver.current_url.lower():
        log("Already logged in to StockCharts")
        return True

    # Find email/username field
    email_field = None
    for sel in [
        (By.ID, "form_UserID"),
        (By.NAME, "form_UserID"),
        (By.CSS_SELECTOR, "input[type='email']"),
    ]:
        try:
            email_field = driver.find_element(*sel)
            break
        except NoSuchElementException:
            continue

    if not email_field:
        log("Could not find email field", "ERROR")
        return False

    email_field.clear()
    email_field.send_keys(email)

    # Find password field
    pwd_field = None
    for sel in [
        (By.ID, "form_UserPassword"),
        (By.NAME, "form_UserPassword"),
        (By.CSS_SELECTOR, "input[type='password']"),
    ]:
        try:
            pwd_field = driver.find_element(*sel)
            break
        except NoSuchElementException:
            continue

    if not pwd_field:
        log("Could not find password field", "ERROR")
        return False

    pwd_field.clear()
    pwd_field.send_keys(password)

    # Check "Remember Me"
    try:
        remember = driver.find_element(By.ID, "form_RememberMe")
        if not remember.is_selected():
            remember.click()
    except Exception:
        pass

    # Click login button
    login_btn = None
    for sel in [
        (By.CSS_SELECTOR, "button[type='submit']"),
        (By.XPATH, "//button[contains(text(), 'Log In')]"),
    ]:
        try:
            login_btn = driver.find_element(*sel)
            break
        except NoSuchElementException:
            continue

    if login_btn:
        driver.execute_script("arguments[0].click();", login_btn)
        time.sleep(5)
        log(f"Post-login URL: {driver.current_url}")
        return True
    else:
        log("Could not find login button", "ERROR")
        return False


def run_ema_scan(driver, chartlist_name, list_key, download_dir, data_dir):
    """Run the 20-day EMA scan for a chartlist and save results.

    Args:
        driver: Selenium WebDriver
        chartlist_name: Full name of the chartlist (e.g., "105 - Leading Stocks...")
        list_key: Key for output naming (e.g., "leading_stocks" or "hot_stocks")
        download_dir: Temp download directory
        data_dir: Output directory (e.g., /data/2026-02-15/)

    Returns:
        Dict with csv_path, image_path, stock_count, symbols
    """
    log(f"Running EMA scan for chartlist: {chartlist_name}")

    # Navigate to Advanced Scan Workbench
    driver.get("https://stockcharts.com/def/servlet/ScanUI")
    time.sleep(5)

    current_url = driver.current_url
    log(f"ScanUI URL: {current_url}")

    # Handle login redirect
    if "login" in current_url.lower():
        log("Redirected to login from ScanUI", "WARNING")
        return None

    # Dismiss any modal dialogs
    dismiss_overlays(driver)
    try:
        driver.execute_script("""
            var modals = document.querySelectorAll('.modal, [role="dialog"]');
            modals.forEach(function(modal) {
                if (modal.style.display === 'block' || modal.classList.contains('in')) {
                    modal.style.display = 'none';
                    modal.classList.remove('in');
                }
            });
            var backdrops = document.querySelectorAll('.modal-backdrop');
            backdrops.forEach(function(b) { b.remove(); });
        """)
    except Exception:
        pass
    time.sleep(2)

    # Enter scan criteria in textarea
    log("Entering 20-EMA scan criteria...")
    try:
        scan_textarea = WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.NAME, "scantext"))
        )
        driver.execute_script("arguments[0].value = arguments[1];", scan_textarea, EMA_SCAN_CRITERIA)
        # Also trigger change event so the UI recognizes the update
        driver.execute_script("arguments[0].dispatchEvent(new Event('change'));", scan_textarea)
        log("Entered scan criteria")
    except Exception as e:
        log(f"Could not find/set scan textarea: {e}", "ERROR")
        return None

    # Click "YOUR ACCOUNT" tab to access ChartLists
    log("Clicking YOUR ACCOUNT tab...")
    try:
        your_account_tab = WebDriverWait(driver, 10).until(
            EC.element_to_be_clickable((By.CSS_SELECTOR, "a[href='#components-your-account']"))
        )
        your_account_tab.click()
        time.sleep(2)
        log("Clicked YOUR ACCOUNT tab")
    except Exception as e:
        log(f"Could not click YOUR ACCOUNT tab: {e}", "ERROR")
        return None

    # Find the chartlist in YOUR CHARTLISTS dropdown
    log(f"Looking for chartlist matching: {chartlist_name}")
    time.sleep(2)

    selects = driver.find_elements(By.TAG_NAME, "select")
    chartlist_dropdown = None
    chartlist_option_text = None

    # Extract search terms from chartlist name
    search_terms = []
    parts = chartlist_name.split(" - ")
    if len(parts) >= 2:
        search_terms.append(parts[0].strip())  # Number e.g. "105"
        search_terms.append(parts[1].strip())  # Title
    else:
        search_terms.append(chartlist_name.strip())

    log(f"Search terms: {search_terms}")

    for sel in selects:
        try:
            if not sel.is_displayed():
                continue
            options = Select(sel).options
            for opt in options:
                opt_text = opt.text
                if all(term.lower() in opt_text.lower() for term in search_terms):
                    chartlist_dropdown = sel
                    chartlist_option_text = opt_text
                    log(f"Found matching chartlist: {opt_text}")
                    break
            if chartlist_dropdown:
                break
        except Exception:
            continue

    if not chartlist_dropdown:
        log("Could not find chartlist in dropdown", "ERROR")
        # Log available options for debugging
        for sel in selects:
            try:
                if sel.is_displayed():
                    opts = Select(sel).options
                    for o in opts[:5]:
                        log(f"  Available: {o.text}")
            except Exception:
                pass
        return None

    # Select the chartlist
    Select(chartlist_dropdown).select_by_visible_text(chartlist_option_text)
    time.sleep(1)
    log(f"Selected chartlist: {chartlist_option_text}")

    # Click "+" button to add chartlist to scan criteria
    try:
        your_account_section = driver.find_element(By.ID, "components-your-account")
        buttons = your_account_section.find_elements(By.TAG_NAME, "button")
        add_button = None
        for btn in buttons:
            btn_class = btn.get_attribute("class") or ""
            if "add-component" in btn_class:
                add_button = btn
                break

        if add_button:
            driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", add_button)
            time.sleep(1)
            add_button.click()
            time.sleep(2)
            log("Clicked '+' button to add chartlist constraint")
        else:
            # Fallback: manually append chartlist constraint to textarea
            log("'+' button not found, manually appending chartlist constraint")
            list_match = re.search(r'list #(\d+)', chartlist_option_text)
            if list_match:
                list_id = list_match.group(1)
                scan_textarea = driver.find_element(By.NAME, "scantext")
                current = scan_textarea.get_attribute("value")
                new_criteria = f"{current}\nAND [CHARTLIST IS ${list_id}]"
                driver.execute_script("arguments[0].value = arguments[1];", scan_textarea, new_criteria)
                log(f"Appended chartlist constraint: AND [CHARTLIST IS ${list_id}]")
            else:
                log("Could not extract list ID from option text", "ERROR")
                return None
    except Exception as e:
        log(f"Error adding chartlist constraint: {e}", "ERROR")
        return None

    # Scroll to top and run scan
    driver.execute_script("window.scrollTo(0, 0);")
    time.sleep(1)

    original_window = driver.current_window_handle
    log("Clicking Run Scan...")
    try:
        run_scan_btn = WebDriverWait(driver, 10).until(
            EC.element_to_be_clickable((By.ID, "runScan"))
        )
        driver.execute_script("arguments[0].click();", run_scan_btn)
        log("Clicked Run Scan")
    except Exception as e:
        log(f"Could not click Run Scan: {e}", "ERROR")
        return None

    # Wait for results window
    time.sleep(8)
    all_windows = driver.window_handles
    log(f"Windows after scan: {len(all_windows)}")

    results_window = None
    if len(all_windows) > 1:
        for window in all_windows:
            if window != original_window:
                driver.switch_to.window(window)
                time.sleep(1)
                cur_url = driver.current_url
                log(f"  Window URL: {cur_url}")
                if "stockcharts.com" in cur_url.lower() and "scanui" not in cur_url.lower():
                    results_window = window
                    break

        if results_window:
            driver.switch_to.window(results_window)
            time.sleep(5)
            log(f"Results page URL: {driver.current_url}")
        else:
            # Fallback to last window
            driver.switch_to.window(all_windows[-1])
            time.sleep(5)
    else:
        log("No new window opened, results may be on same page")
        time.sleep(5)

    # Get scan result count
    page_text = driver.find_element(By.TAG_NAME, "body").text
    count_match = re.search(r'Matching Results:\s*(\d+)', page_text)
    if not count_match:
        count_match = re.search(r'(\d+)\s+results?', page_text, re.IGNORECASE)
    stock_count = int(count_match.group(1)) if count_match else 0
    log(f"Scan results: {stock_count} stocks")

    if stock_count == 0:
        log("No stocks matched the EMA scan criteria")
        # Close extra windows
        _cleanup_windows(driver, original_window)
        return {"csv_path": None, "image_path": None, "stock_count": 0, "symbols": []}

    # Set download directory for CSV
    driver.execute_cdp_cmd("Page.setDownloadBehavior", {
        "behavior": "allow",
        "downloadPath": download_dir,
    })

    # Clear download dir
    for f in globmod.glob(os.path.join(download_dir, "*.*")):
        try:
            os.remove(f)
        except Exception:
            pass

    # Download CSV
    log("Downloading CSV...")
    try:
        csv_btn = WebDriverWait(driver, 10).until(
            EC.element_to_be_clickable((By.ID, "download-csv"))
        )
        driver.execute_script("arguments[0].click();", csv_btn)
        time.sleep(5)
        log("CSV download initiated")
    except Exception as e:
        log(f"Could not click CSV download: {e}", "WARNING")
        try:
            csv_btn = driver.find_element(By.ID, "download-csv")
            driver.execute_script("arguments[0].click();", csv_btn)
            time.sleep(5)
        except Exception:
            log("CSV download failed", "ERROR")

    # Switch to CandleGlance view
    log("Switching to CandleGlance view...")
    try:
        cg_tab = WebDriverWait(driver, 10).until(
            EC.element_to_be_clickable((By.LINK_TEXT, "CandleGlance"))
        )
        cg_tab.click()
        time.sleep(8)
        log("CandleGlance view loaded")
    except Exception as e:
        log(f"Could not switch to CandleGlance: {e}", "WARNING")

    # Take screenshot
    os.makedirs(data_dir, exist_ok=True)
    image_filename = f"{list_key}_candleglance.png"
    image_path = os.path.join(data_dir, image_filename)
    driver.save_screenshot(image_path)
    log(f"Screenshot saved: {image_path}")

    # Find and move CSV file
    csv_files = globmod.glob(os.path.join(download_dir, "*.csv"))
    csv_path = None
    symbols = []

    if csv_files:
        src_csv = max(csv_files, key=os.path.getmtime)
        csv_filename = f"{list_key}_scan.csv"
        csv_path = os.path.join(data_dir, csv_filename)
        shutil.move(src_csv, csv_path)
        log(f"CSV saved: {csv_path}")

        # Extract symbols from CSV
        try:
            with open(csv_path, 'r') as f:
                reader = csv.reader(f)
                header = next(reader, None)
                if header:
                    # Find symbol column (usually first or named "Symbol")
                    sym_idx = 0
                    for i, col in enumerate(header):
                        if 'symbol' in col.lower() or 'ticker' in col.lower():
                            sym_idx = i
                            break
                    for row in reader:
                        if row and len(row) > sym_idx and row[sym_idx].strip():
                            symbols.append(row[sym_idx].strip())
            log(f"Extracted {len(symbols)} symbols from CSV: {symbols}")
        except Exception as e:
            log(f"Error parsing CSV for symbols: {e}", "WARNING")
    else:
        log("No CSV file found in download directory", "WARNING")

    # Clean up windows - close results window, switch back to original
    _cleanup_windows(driver, original_window)

    return {
        "csv_path": csv_path,
        "image_path": image_path,
        "stock_count": stock_count,
        "symbols": symbols,
        "chartlist_name": chartlist_name,
    }


def _cleanup_windows(driver, keep_window):
    """Close all windows except the one to keep."""
    try:
        all_windows = driver.window_handles
        for w in all_windows:
            if w != keep_window:
                try:
                    driver.switch_to.window(w)
                    driver.close()
                except Exception:
                    pass
        driver.switch_to.window(keep_window)
    except Exception:
        pass


def main():
    parser = argparse.ArgumentParser(description="EMA Scanner automation for StockCharts")
    parser.add_argument("--sc-username", required=True, help="StockCharts email")
    parser.add_argument("--sc-password", required=True, help="StockCharts password")
    parser.add_argument("--leading-url", default="", help="Leading Stocks shared chart URL")
    parser.add_argument("--leading-password", default="", help="Leading Stocks chartlist password")
    parser.add_argument("--hot-url", default="", help="Hot Stocks shared chart URL")
    parser.add_argument("--hot-password", default="", help="Hot Stocks chartlist password")
    parser.add_argument("--data-dir", default="/data", help="Base data directory")
    args = parser.parse_args()

    today = get_eastern_date()
    dated_dir = os.path.join(args.data_dir, today)
    os.makedirs(dated_dir, exist_ok=True)

    download_dir = os.path.join("/tmp", "ema_downloads")
    os.makedirs(download_dir, exist_ok=True)

    result = {
        "success": False,
        "date": today,
        "data_dir": dated_dir,
        "leading_stocks": None,
        "hot_stocks": None,
        "error": None,
    }

    driver = None
    try:
        driver = setup_driver(download_dir)
        original_window = driver.current_window_handle

        # Track chartlist names for scanning later
        chartlist_info = {}

        # Step 1: Unlock and save chartlists from shared URLs
        lists_to_process = []
        if args.leading_url:
            lists_to_process.append(("leading_stocks", args.leading_url, args.leading_password))
        if args.hot_url:
            lists_to_process.append(("hot_stocks", args.hot_url, args.hot_password))

        for list_key, sc_url, cl_password in lists_to_process:
            log(f"--- Processing {list_key} ---")
            chartlist_name = unlock_chartlist(driver, sc_url, cl_password)
            if chartlist_name:
                chartlist_info[list_key] = chartlist_name
                log(f"Saved chartlist: {chartlist_name}")
            else:
                log(f"Failed to unlock/save chartlist for {list_key}", "ERROR")

            # Clean up windows after each unlock
            _cleanup_windows(driver, original_window)
            time.sleep(2)

        if not chartlist_info:
            result["error"] = "No chartlists could be unlocked"
            print(json.dumps(result))
            return

        # Step 2: Login to StockCharts
        if not login_stockcharts(driver, args.sc_username, args.sc_password):
            result["error"] = "StockCharts login failed"
            print(json.dumps(result))
            return

        # Step 3: Run EMA scan for each chartlist
        for list_key, chartlist_name in chartlist_info.items():
            log(f"--- Running EMA scan for {list_key}: {chartlist_name} ---")

            scan_result = run_ema_scan(
                driver, chartlist_name, list_key, download_dir, dated_dir
            )

            if scan_result:
                result[list_key] = scan_result
                log(f"EMA scan complete for {list_key}: {scan_result.get('stock_count', 0)} stocks")
            else:
                log(f"EMA scan failed for {list_key}", "ERROR")
                result[list_key] = {"csv_path": None, "image_path": None, "stock_count": 0, "symbols": []}

        result["success"] = True

    except Exception as e:
        result["error"] = str(e)
        log(f"EMA scanner failed: {e}", "ERROR")
        import traceback
        traceback.print_exc(file=sys.stderr)
    finally:
        if driver:
            driver.quit()

    # Output JSON result to stdout
    print(json.dumps(result))


if __name__ == "__main__":
    main()
