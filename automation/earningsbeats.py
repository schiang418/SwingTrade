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
    time.sleep(3)

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
    return True


def parse_update_date(text):
    """Extract date from text like 'last update: 2/7/26' or 'Last Update: 2/9/26'"""
    match = re.search(r'[Ll]ast\s+[Uu]pdate[:\s]+(\d{1,2}/\d{1,2}/\d{2,4})', text)
    if match:
        return match.group(1)
    return None


def find_section_info(driver, heading_text):
    """Find a chartlist section and extract update date and Excel download link."""
    try:
        # Find the heading
        heading = driver.find_element(
            By.XPATH, f"//h2[contains(text(), '{heading_text}')] | //h3[contains(text(), '{heading_text}')] | //strong[contains(text(), '{heading_text}')]"
        )
        log(f"Found section: {heading_text}")

        # Get the parent container - look for surrounding div or section
        parent = heading.find_element(By.XPATH, "./ancestor::div[1]")

        # Try to get update date from text near the heading
        section_text = parent.text
        update_date = parse_update_date(section_text)

        if not update_date:
            # Try broader parent
            try:
                broader_parent = heading.find_element(By.XPATH, "./ancestor::div[2]")
                section_text = broader_parent.text
                update_date = parse_update_date(section_text)
            except Exception:
                pass

        if not update_date:
            # Try siblings and nearby elements
            try:
                # Look for text containing "last update" near the heading
                nearby = driver.find_elements(
                    By.XPATH, f"//h2[contains(text(), '{heading_text}')]/following::*[position()<=10]"
                )
                for elem in nearby:
                    date = parse_update_date(elem.text)
                    if date:
                        update_date = date
                        break
            except Exception:
                pass

        log(f"Update date for {heading_text}: {update_date}")

        # Find the Microsoft Excel download link near this section
        excel_link = None
        try:
            # Look for "Microsoft Excel" link within or near the section
            links = driver.find_elements(
                By.XPATH,
                f"//h2[contains(text(), '{heading_text}')]/following::a[contains(text(), 'Microsoft Excel')][1]"
            )
            if not links:
                links = driver.find_elements(
                    By.XPATH,
                    f"//h3[contains(text(), '{heading_text}')]/following::a[contains(text(), 'Microsoft Excel')][1]"
                )
            if not links:
                links = driver.find_elements(
                    By.XPATH,
                    f"//strong[contains(text(), '{heading_text}')]/following::a[contains(text(), 'Microsoft Excel')][1]"
                )
            if links:
                excel_link = links[0]
                log(f"Found Excel link for {heading_text}")
        except Exception as e:
            log(f"Could not find Excel link for {heading_text}: {e}", "WARNING")

        return {
            "update_date": update_date,
            "excel_link": excel_link,
        }
    except Exception as e:
        log(f"Could not find section '{heading_text}': {e}", "ERROR")
        return {"update_date": None, "excel_link": None}


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
        leading_info = find_section_info(driver, "Leading Stocks ChartList")
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
        time.sleep(1)

        # Check Matt's Hot Stocks ChartList
        hot_info = find_section_info(driver, "Hot Stocks ChartList")
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
