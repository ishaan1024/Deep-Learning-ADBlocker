# Chrome Extension Installation Guide

Follow these steps to install the ad blocker Chrome extension:

## Prerequisites
- The `.zip` file has been extracted to an appropriate directory on your computer.

## Installation Steps
1.  **Open Chrome Extensions Page**  
    - Open Google Chrome.
    - Navigate to `chrome://extensions` in the address bar.

4. **Enable Developer Mode**  
    - Toggle the **Developer mode** switch in the top-right corner of the page.

5. **Load the Extension**  
    - Click on the **Load unpacked** button.
    - Navigate to the directory where you extracted the extension files and select the `AdBlocker_Extension` directory

6. **Verify Installation**  
    - The extension should now appear in the list of installed extensions.
    - Ensure it is enabled.

## Troubleshooting
- If the extension does not load, ensure you have selected the correct directory.

---

# Folder Overview

This directory contains the following components:

1. **`AdBlocker_Extension/`**  
   - Source code for the Chrome extension.
   - Key files and directories:
     - `manifest.json`: Defines extension metadata and permissions.
     - `src/background.js`: Service Worker script that manages background tasks.
     - `background.bundle.js`: Webpack-bundled version of `src/background.js`.
     - `content.js`: Injected into webpages to block advertisements in real-time.
     - `classifier/`: TensorFlow.js-exported Neural Network binary classifier.
     - `popup/`: Files for the extension's popup user interface.

2. **`Model_Training.ipynb`**  
   - Jupyter notebook (designed for Google Colab) used to train and tune the binary classifier models.
   - Recommended to run on a GPU-enabled environment for faster performance.

3. **`requirements.txt`**  
   - List of Python packages required to run `Model_Training.ipynb`.

---
