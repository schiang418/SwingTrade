#!/usr/bin/env python3
"""
EarningsBeats Automation: Login, check update dates, download Excel files
for Leading Stocks ChartList and Matt's Hot Stocks ChartList.

Usage:
  python earningsbeats.py --userid USER --password PASS [--leading-date DATE] [--hot-date DATE] [--download-dir DIR]

Outputs JSON to stdout with results.
"""

import argparse
import json
import os
import sys
import time
import glob
import re
from datetime import datetime
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.common.exceptions import TimeoutException, NoSuchElementException


def log(msg, level="INFO"):
    print(f"[{datetime.now().isoformat()}] [{level}] {msg}", file=sys.stderr)


def setup_driver(download_dir):
    chrome_options = Options()
    chrome_options.add_argument("--headless=new")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--window-size=1920,1080")
    chrome_options.add_argument("--disable-blink-features=AutomationControlled")
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


def login(driver, userid, password):
    log("Navigating to EarningsBeats login page")
    driver.get("https://www.earningsbeats.com/members/login.cfm")

    wait = WebDriverWait(driver, 30)
    username_field = wait.until(EC.presence_of_element_located((By.ID, "UserID")))
    username_field.send_keys(userid)

    password_field = driver.find_element(By.ID, "Password")
    password_field.send_keys(password)

    login_button = driver.find_element(By.ID, "btnLogin")
    login_button.click()

    time.sleep(3)

    if "members" in driver.current_url:
        log("Login successful")
        return True
    else:
        log("Login may have failed", "WARNING")
        return False


def navigate_to_chartlists(driver):
    log("Navigating to ChartLists page")
    driver.get("https://www.earningsbeats.com/members/chartlists.cfm")
    time.sleep(5)

    # Dismiss cookie notice if present
    try:
        accept_button = driver.find_element(
            By.XPATH, "//button[contains(text(), 'Accept')] | //a[contains(text(), 'Accept')]"
        )
        accept_button.click()
        time.sleep(1)
    except Exception:
        pass

    log("On ChartLists page")

    # Dump page text for debugging so we can see what's actually on the page
    try:
        page_text = driver.find_element(By.TAG_NAME, "body").text
        # Log first 3000 chars to see page structure
        log(f"Page text preview (first 3000 chars):\n{page_text[:3000]}")

        # Also log all link texts on the page
        links = driver.find_elements(By.TAG_NAME, "a")
        link_texts = [l.text.strip() for l in links if l.text.strip()]
        log(f"Links on page: {link_texts[:30]}")

        # Log all headings and bold elements
        for tag in ['h1', 'h2', 'h3', 'h4', 'b', 'strong', 'font']:
            elems = driver.find_elements(By.TAG_NAME, tag)
            texts = [e.text.strip() for e in elems if e.text.strip()]
            if texts:
                log(f"<{tag}> elements: {texts[:20]}")
    except Exception as e:
        log(f"Could not dump page text: {e}", "WARNING")

    return True


def parse_update_date(text):
    """Extract date from text like 'last update: 2/7/26' or 'Last Update: 2/9/26'"""
    match = re.search(r'[Ll]ast\s+[Uu]pdate[:\s]+(\d{1,2}/\d{1,2}/\d{2,4})', text)
    if match:
        return match.group(1)
    return None


def xpath_string(s):
    """Build an XPath string literal that handles both single and double quotes.

    If s contains a single quote (e.g. "Matt's"), we can't use '...' directly.
    Uses concat() to safely handle any combination of quotes.
    """
    if "'" not in s:
        return f"'{s}'"
    if '"' not in s:
        return f'"{s}"'
    # Contains both quote types - use concat()
    parts = s.split("'")
    return "concat(" + ", \"'\", ".join(f"'{p}'" for p in parts) + ")"


def find_section_info(driver, heading_text, alt_texts=None):
    """Find a chartlist section and extract update date and Excel download link.

    Uses a broad search strategy across all element types, with WebDriverWait,
    and tries alternative text variations if provided.

    Args:
        driver: Selenium WebDriver instance
        heading_text: Primary text to search for (e.g. 'Leading Stocks ChartList')
        alt_texts: Optional list of alternative text variations to try
    """
    search_texts = [heading_text] + (alt_texts or [])

    heading = None
    matched_text = None

    for text in search_texts:
        xs = xpath_string(text)

        # Strategy 1: Search across ALL element types using contains(text(), ...)
        try:
            heading = WebDriverWait(driver, 5).until(
                EC.presence_of_element_located((
                    By.XPATH,
                    f"//*[contains(text(), {xs})]"
                ))
            )
            matched_text = text
            log(f"Found section '{text}' via text() match in <{heading.tag_name}> tag")
            break
        except (TimeoutException, NoSuchElementException):
            pass

        # Strategy 2: Search using contains(., ...) which checks descendant text too
        try:
            # Exclude body/html level matches by targeting specific tags
            for tag in ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'b', 'strong',
                        'font', 'span', 'div', 'td', 'th', 'a', 'li', 'dt', 'dd', 'label']:
                try:
                    elems = driver.find_elements(
                        By.XPATH,
                        f"//{tag}[contains(., {xs})]"
                    )
                    # Pick the most specific (smallest text length) match
                    if elems:
                        elems = sorted(elems, key=lambda e: len(e.text) if e.text else 9999)
                        heading = elems[0]
                        matched_text = text
                        log(f"Found section '{text}' via descendant text in <{tag}> tag")
                        break
                except Exception:
                    continue
            if heading:
                break
        except Exception:
            pass

        log(f"Could not find '{text}' on page, trying next variation...", "WARNING")

    if not heading:
        log(f"Could not find section with any of: {search_texts}", "ERROR")
        # Try a last-resort page-text regex search for update date
        update_date = _find_date_near_text_in_page(driver, search_texts)
        return {"update_date": update_date, "excel_link": None}

    # Get update date from nearby context
    update_date = None

    # Try parent containers at various levels
    for ancestor_level in range(1, 5):
        try:
            parent = heading.find_element(By.XPATH, f"./ancestor::*[{ancestor_level}]")
            section_text = parent.text or ""
            update_date = parse_update_date(section_text)
            if update_date:
                break
        except Exception:
            continue

    if not update_date:
        # Try following siblings/elements
        try:
            mxs = xpath_string(matched_text)
            nearby = driver.find_elements(
                By.XPATH,
                f"//*[contains(text(), {mxs})]/following::*[position()<=15]"
            )
            for elem in nearby:
                try:
                    date = parse_update_date(elem.text or "")
                    if date:
                        update_date = date
                        break
                except Exception:
                    continue
        except Exception:
            pass

    if not update_date:
        # Fallback: search full page text near the heading text
        update_date = _find_date_near_text_in_page(driver, [matched_text])

    log(f"Update date for {heading_text}: {update_date}")

    # Find the Microsoft Excel download link near this section
    excel_link = _find_excel_link(driver, matched_text, heading)

    return {
        "update_date": update_date,
        "excel_link": excel_link,
    }


def _find_date_near_text_in_page(driver, search_texts):
    """Fallback: search full page text for update date near any of the search texts."""
    try:
        page_text = driver.find_element(By.TAG_NAME, "body").text
        for text in search_texts:
            idx = page_text.lower().find(text.lower())
            if idx >= 0:
                # Look for date pattern within 500 chars after the heading text
                nearby_text = page_text[idx:idx + 500]
                date = parse_update_date(nearby_text)
                if date:
                    log(f"Found date via page text search near '{text}': {date}")
                    return date
    except Exception:
        pass
    return None


def _find_excel_link(driver, matched_text, heading_elem):
    """Find the Microsoft Excel download link near the matched section."""
    excel_link = None
    mxs = xpath_string(matched_text)

    # Strategy 1: Look for Excel link following the heading element
    try:
        links = driver.find_elements(
            By.XPATH,
            f"//*[contains(text(), {mxs})]/following::a[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'microsoft excel')][1]"
        )
        if links:
            excel_link = links[0]
            log(f"Found Excel link via following::a from heading")
            return excel_link
    except Exception:
        pass

    # Strategy 2: Look for any link with "Excel" in text or href near the section
    try:
        links = driver.find_elements(
            By.XPATH,
            f"//*[contains(text(), {mxs})]/following::a[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'excel')][1]"
        )
        if links:
            excel_link = links[0]
            log(f"Found Excel link via 'excel' text match")
            return excel_link
    except Exception:
        pass

    # Strategy 3: Look for links with .xls in href
    try:
        links = driver.find_elements(
            By.XPATH,
            f"//*[contains(text(), {mxs})]/following::a[contains(@href, '.xls')][1]"
        )
        if links:
            excel_link = links[0]
            log(f"Found Excel link via .xls href")
            return excel_link
    except Exception:
        pass

    # Strategy 4: Look in parent containers for Excel links
    for ancestor_level in range(1, 5):
        try:
            parent = heading_elem.find_element(By.XPATH, f"./ancestor::*[{ancestor_level}]")
            parent_links = parent.find_elements(
                By.XPATH,
                ".//a[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'excel')]"
            )
            if parent_links:
                excel_link = parent_links[0]
                log(f"Found Excel link in ancestor level {ancestor_level}")
                return excel_link
        except Exception:
            continue

    log(f"Could not find Excel link for '{matched_text}'", "WARNING")
    return None


def wait_for_download(download_dir, timeout=30):
    """Wait for a file to finish downloading in the download directory."""
    end_time = time.time() + timeout
    while time.time() < end_time:
        # Check for .crdownload (Chrome partial download) files
        partial = glob.glob(os.path.join(download_dir, "*.crdownload"))
        if not partial:
            # Check for any new files
            files = glob.glob(os.path.join(download_dir, "*.*"))
            xls_files = [f for f in files if f.endswith(('.xls', '.xlsx', '.csv'))]
            if xls_files:
                # Return the most recently modified file
                newest = max(xls_files, key=os.path.getmtime)
                return newest
        time.sleep(1)
    return None


def download_excel(driver, excel_link, download_dir, label):
    """Click the Excel link and wait for download."""
    if not excel_link:
        log(f"No Excel link for {label}", "ERROR")
        return None

    # Clear existing downloads
    for f in glob.glob(os.path.join(download_dir, "*.*")):
        try:
            os.remove(f)
        except Exception:
            pass

    log(f"Clicking Excel download for {label}")
    try:
        driver.execute_script("arguments[0].scrollIntoView(true);", excel_link)
        time.sleep(1)
        excel_link.click()
    except Exception:
        driver.execute_script("arguments[0].click();", excel_link)

    time.sleep(2)

    file_path = wait_for_download(download_dir)
    if file_path:
        log(f"Downloaded: {file_path}")
    else:
        log(f"Download may have failed for {label}", "WARNING")

    return file_path


def main():
    parser = argparse.ArgumentParser(description="EarningsBeats automation")
    parser.add_argument("--userid", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--leading-date", default="none", help="Known date for Leading Stocks")
    parser.add_argument("--hot-date", default="none", help="Known date for Hot Stocks")
    parser.add_argument("--download-dir", default="/tmp/eb_downloads", help="Download directory")
    args = parser.parse_args()

    os.makedirs(args.download_dir, exist_ok=True)

    result = {
        "success": False,
        "leading_stocks": {"date_on_page": None, "is_new": False, "file_path": None},
        "hot_stocks": {"date_on_page": None, "is_new": False, "file_path": None},
        "error": None,
    }

    driver = None
    try:
        driver = setup_driver(args.download_dir)

        if not login(driver, args.userid, args.password):
            result["error"] = "Login failed"
            print(json.dumps(result))
            return

        if not navigate_to_chartlists(driver):
            result["error"] = "Failed to navigate to ChartLists"
            print(json.dumps(result))
            return

        # Check Leading Stocks ChartList
        # Try multiple name variations - the page may use different formatting
        leading_info = find_section_info(driver, "Leading Stocks ChartList", alt_texts=[
            "Leading Stocks",
            "Leading Stocks in Leading Industries",
            "LSCL",
            "Bullish Trifecta ChartList",
            "BTCL",
        ])
        result["leading_stocks"]["date_on_page"] = leading_info["update_date"]

        if leading_info["update_date"] and leading_info["update_date"] != args.leading_date:
            result["leading_stocks"]["is_new"] = True
            # Create subdirectory for this download
            leading_dir = os.path.join(args.download_dir, "leading")
            os.makedirs(leading_dir, exist_ok=True)

            # We need to re-setup download path for this specific download
            driver.execute_cdp_cmd("Page.setDownloadBehavior", {
                "behavior": "allow",
                "downloadPath": leading_dir,
            })

            file_path = download_excel(driver, leading_info["excel_link"], leading_dir, "Leading Stocks")
            result["leading_stocks"]["file_path"] = file_path
        else:
            log("Leading Stocks date unchanged, skipping download")

        # Scroll down to find Hot Stocks section
        driver.execute_script("window.scrollBy(0, 800)")
        time.sleep(2)

        # Check Matt's Hot Stocks ChartList
        # Try multiple name variations since this list may have different names on the page
        # Note: "Matt's" contains an apostrophe - xpath_string() handles this via concat()
        hot_info = find_section_info(driver, "Hot Stocks ChartList", alt_texts=[
            "Matt's Hot Stocks ChartList",
            "Matt's Hot Stocks",
            "Matts Hot Stocks",
            "Hot Stocks",
            "HTCL",
            "Short Squeeze ChartList",
            "Short Squeeze",
        ])
        result["hot_stocks"]["date_on_page"] = hot_info["update_date"]

        if hot_info["update_date"] and hot_info["update_date"] != args.hot_date:
            result["hot_stocks"]["is_new"] = True
            hot_dir = os.path.join(args.download_dir, "hot")
            os.makedirs(hot_dir, exist_ok=True)

            driver.execute_cdp_cmd("Page.setDownloadBehavior", {
                "behavior": "allow",
                "downloadPath": hot_dir,
            })

            file_path = download_excel(driver, hot_info["excel_link"], hot_dir, "Hot Stocks")
            result["hot_stocks"]["file_path"] = file_path
        else:
            log("Hot Stocks date unchanged, skipping download")

        result["success"] = True

    except Exception as e:
        result["error"] = str(e)
        log(f"Automation failed: {e}", "ERROR")
    finally:
        if driver:
            driver.quit()

    # Output JSON result to stdout
    print(json.dumps(result))


if __name__ == "__main__":
    main()
