let isActive = true; // Tracks whether the script is active
chrome.storage.sync.get("extensionEnabled", (data) => {
    if (data.extensionEnabled !== undefined) {
        isActive = data.extensionEnabled;
    }
});

let observer; // Store the MutationObserver instance for toggling
const classified = new Map();
let adsBlocked = 0;

// Initial static DOM analysis
$(document).ready(function () {
    console.log("Document ready at " + performance.now());

    const elementsToCheck = ['script','iframe', 'img', 'a'];

    // Helper function to process elements
    function processDynamicElements(nodes) {
        const filteredNodes = Array.from(nodes).filter((node) => {
            // Check if the element matches one of the target types
            if (node.nodeType === Node.ELEMENT_NODE) {
                const tagName = node.tagName.toLowerCase();
                return elementsToCheck.includes(tagName);
            }
            return false;
        });

        if (filteredNodes.length > 0) {
            processElements(filteredNodes);
        }
    }

    // Process existing elements
    elementsToCheck.forEach((type) => {
        processElements(document.querySelectorAll(type));
    });

    // Set up MutationObserver for dynamic changes
    observer = new MutationObserver((mutations) => {
        const nodesToProcess = [];
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                nodesToProcess.push(node);
            });
        });

        processDynamicElements(nodesToProcess);
    });

    // Start observing DOM for changes
    observer.observe(document.body, { childList: true, subtree: true });
});


// Start functionality
function startScript() {
    if (isActive) return; // Already active
    isActive = true;
    console.log("Script activated");
  
    // Re-observe mutations
    const target = document.documentElement || document.body;
    const config = { childList: true, subtree: true };
    observer.observe(target, config);

    // Notify the background script to reload the page
    chrome.runtime.sendMessage({ action: "reload" });
}
  
// Stop functionality
function stopScript() {
    if (!isActive) return; // Already inactive
    isActive = false;
    console.log("Script deactivated");
  
    // Disconnect the observer to stop listening for mutations
    observer.disconnect();

    // Notify the background script to reload the page
    chrome.runtime.sendMessage({ action: "reload" });
}
  
// Listen for messages from the popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "start") {
        startScript();
    } else if (message.action === "stop") {
        stopScript();
    } else if (message.action === "getCount") {
        sendResponse({ success: true, adsBlocked });
    }
});

let classifiedElements = [];

// Function to process and classify elements
async function processElements(elements) {
    if (!isActive) return; // Skip processing if the script is inactive
    elements = Array.from(elements);
    await Promise.all(elements.map(async (element) => {
        const classification = await classifyElement(element);
        if (classification === 'AD') { // Remove element from DOM
            removeAd(element);
        }
    }));
}

// Function to remove ad elements and surrounding containers with similar aspect ratios
function removeAd(node) {
    if (node.nodeType === 'SCRIPT') {
        node.remove();
        return;
    }

    adsBlocked += 1;
    chrome.runtime.sendMessage({ action: "updateCounter", count: adsBlocked });

    const adAspectRatio = calculateAspectRatio(node);
    let parent = node.parentNode;

    // Remove the ad element
    node.remove();
    
    let i = 0;
    // Traverse up the DOM to check for surrounding containers
    while (parent && i < 4) {
        const parentAspectRatio = calculateAspectRatio(parent);

        const grandParent = parent.parentNode; // Save the parent of the current parent
        // Remove the container if it has a similar aspect ratio to the ad
        if (node.nodeType === Node.ELEMENT_NODE && isAspectRatioSimilar(adAspectRatio, parentAspectRatio) && parent.children.length < 2) {
            parent.remove();
        } 
        parent = grandParent; // Move to the next level up
        i++;
    }
}

// Helper function to calculate the aspect ratio of an element
function calculateAspectRatio(element) {
    const width = element.offsetHeight;
    const height = element.offsetWidth;

    // Avoid division by zero
    return width > 0 && height > 0 ? width / height : null;
}

// Helper function to check if two aspect ratios are similar
function isAspectRatioSimilar(ratio1, ratio2, tolerance = 1.0) {
    if (ratio1 === null || ratio2 === null) return false;
    return Math.abs(ratio1 - ratio2) <= tolerance; // Allow a small tolerance
}

// Function to classify elements
async function classifyElement(element) {
    if (classified.has(element)) {
        const prediction = classified.get(element);
        return prediction < 0.5 ? 'AD' : 'NOT_AD';
    }

    const features = await extractFeatures(element);

    if (features) {
        const featureValues = Object.values(features);
        try {
            const prediction = await getPrediction(featureValues); // Wait for prediction
            classified.set(element,prediction);
            return prediction < 0.5 ? 'AD' : 'NOT_AD';
        } catch (error) {
            console.error('Error during classification:', error);
            return 'UNKNOWN';
        }
    } else {return 'NOT_AD'}
}

// Function to request a prediction from the background script
async function getPrediction(features) {
    return new Promise((resolve, reject) => {
        // Send a message to the background script with the input features
        chrome.runtime.sendMessage({ type: 'getPrediction', features: features }, (response) => {
            if (response && response.success) {
                resolve(response.prediction); // Resolve the promise with the prediction result
            } else {
                reject(response ? response.error : 'No response from background script');
            }
        });
    });
}

function getURL(element) {
    try{
        if (element.tagName === 'A'){
            return element.href;
        } else {
            return element.src;
        }
    } catch (error){
        console.error("Error getting url: "+element);
        return null;
    }
}

// Function to extract features from JavaScript code
async function extractFeatures(element) {
    const jsCode = extractJavaScriptCode(element);
    const url = getURL(element);

    if (!url && !jsCode && element.tagName === 'A'){return null;}

    const embeddings = await getURLEmbeddings(url);
    const ngramFreqs = getNgramFreq(jsCode);
    
    const features = {
        url_length: urlLength(url),
        brackettodot: calculateBracketToDotRatio(jsCode),
        is_third_party: isThirdParty(url),
        keyword_char_present: adKeywordPresent(url),
        fqdn_4: embeddings[4],
        fqdn_13: embeddings[13],
        fqdn_14: embeddings[14],
        fqdn_15: embeddings[15],
        fqdn_23: embeddings[23],
        fqdn_26: embeddings[26],
        fqdn_27: embeddings[27],
        ng_0_0_2: ngramFreqs['0_0_2'],
        ng_0_15_15: ngramFreqs['0_15_15'],
        ng_2_13_2: ngramFreqs['2_13_2'],
        ng_15_0_3: ngramFreqs['15_0_3'],
        ng_15_0_15: ngramFreqs['15_0_15'],
        ng_15_15_15: ngramFreqs['15_15_15'],
        avg_ident: calculateAverageIdentifierLength(jsCode),
        avg_charperline: calculateAverageCharsPerLine(jsCode)
    };

    return features;
}

// Function to extract JavaScript code from an element
function extractJavaScriptCode(element) {
    if (element.tagName === 'SCRIPT') {
    return element.innerText || element.textContent;
    }
    if (element.tagName === 'IFRAME') {
        let iframeDocument;
        try {
            iframeDocument = element.contentWindow.document;
        } catch (error) {
            return null;
        }

        const scripts = iframeDocument.querySelectorAll('script');
        let jsCode = '';
        scripts.forEach((script) => {
            jsCode += script.innerText || script.textContent;
        });
        
        return jsCode;
    }
    return null;
}

// Function to calculate the ratio of brackets to dots in the code
function calculateBracketToDotRatio(jsCode) {
    if (!jsCode) return 0;
    const bracketsCount = (jsCode.match(/[{}\[\]]/g) || []).length;
    const dotsCount = (jsCode.match(/\./g) || []).length;
    return dotsCount === 0 ? 0 : bracketsCount / dotsCount;
}

// Function to calculate the average length of identifiers
function calculateAverageIdentifierLength(jsCode) {
    if (!jsCode) return 0;
    const identifiers = jsCode.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g) || [];
    const totalLength = identifiers.reduce((sum, identifier) => sum + identifier.length, 0);
    return identifiers.length === 0 ? 0 : totalLength / identifiers.length;
}

// Function to calculate the average number of characters per line in the code
function calculateAverageCharsPerLine(jsCode) {
    if (!jsCode) return 0;
    const lines = jsCode.split('\n');
    const totalChars = lines.reduce((sum, line) => sum + line.length, 0);
    return lines.length === 0 ? 0 : totalChars / lines.length;
}

// Ad-related keywords (from AdFlush)
const adKeywords = [
    "ad", "ads", "advert", "popup", "banner", "sponsor", "iframe", "googlead", "adsys",
    "adser", "advertise", "redirect", "popunder", "punder", "popout", "click", "track",
    "play", "pop", "prebid", "bid", "pb\\.min", "affiliate", "ban", "delivery", "promo",
    "tag", "zoneid", "siteid", "pageid", "size", "viewid", "zone_id", "gamble", "google_afc", "google_afs",
    "googlesyndication"
];

const keywordChars = [".", "/", "&", "=", ";", "-", "_", "*", "^", "?", "|", ","];

// Function to check if a URL contains ad-related keywords
function adKeywordPresent(url) {
    for (let keyword of adKeywords) {
        let regex = new RegExp(`\\b${keyword}\\b`, "ig");
        let matches = [...url.matchAll(regex)];

        for (let match of matches) {
            let index = match.index;
            if (index > 0) {
                let prevChar = url[index - 1];
                if (keywordChars.includes(prevChar)) {
                    return 1; // Ad keyword detected
                }
            }
        }
    }

    return 0; // No ad-related keyword found
}

// Function to check if the URL is third-party
function isThirdParty(url) {
    // Create a link element to parse the URL
    const link = document.createElement('a');
    link.href = url;

    // Get the domain of the parent page (same-origin)
    const parentDomain = window.location.hostname;

    // Check if the domain of the URL is different from the parent domain
    return link.hostname !== parentDomain ? 1 : 0;
}

// Function to get length of a url
function urlLength(url) {
    if (!url) return 0;
    return url.length;
}

// Function to request a parse from the background script
async function parse(url) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'parse', url }, (response) => {
            if (response && response.success) {
                resolve(response.parsed); // Resolve with the parsed data
            } else {
                console.error('Error getting parse:', response?.message);
                reject(new Error(response?.message || 'Unknown error occurred'));
            }
        });
    });
}

// Function to request an embedding from the background script
async function getEmbedding(char) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'getEmbedding', char }, (response) => {
            if (response && response.success) {
                resolve(response.embedding); // Resolve with the embedding
            } else {
                console.error('Error getting embedding:', response?.message);
                reject(new Error(response?.message || 'Unknown error occurred'));
            }
        });
    });
}

// Function to get URL embeddings
async function getURLEmbeddings(url) {
    if (!url) return Array(30).fill(0); // Return zero vector for missing URL

    let fqdn = await parse(url);
    if (fqdn === null) {return Array(30).fill(0);}
    const urlsplit = fqdn.split('');

    let avg;
    try {
        const embedding = urlsplit.reduce(async (sum, char) => {
            const vec = await getEmbedding(char);
            if (vec) {
                return (await sum).map((val, i) => val + vec[i]);
            }
            return await sum;
        }, Promise.resolve(Array(30).fill(0)));
        avg = (await embedding).map((val) => val / urlsplit.length);
    } catch (error) {
        console.error("Error in embeddings: " + error);
    }


    return avg;
}

// N-gram dictionary (from AdFlush)
const ngramDict={
    'ArrayExpression': 0,
      'ArrayPattern': 5,
      'ArrowFunctionExpression': 0,
      'AssignmentExpression': 0,
      'AssignmentPattern': 5,
      'AwaitExpression': 0,
      'BinaryExpression': 0,
      'BlockComment': 7,
      'BlockStatement': 2,
      'BreakStatement': 2,
      'CallExpression': 0,
      'CatchClause': 13,
      'ChainExpression':0,
      'ClassBody': 14,
      'ClassDeclaration': 4,
      'ClassExpression': 0,
      'ConditionalExpression': 0,
      'ContinueStatement': 2,
      'DebuggerStatement': 2,
      'DoWhileStatement': 2,
      'EmptyStatement': 2,
      'ExportAllDeclaration': 4,
      'ExportDefaultDeclaration': 4,
      'ExportNamedDeclaration': 4,
      'ExportSpecifier': 6,
      'ExpressionStatement': 2,
      'ForInStatement': 2,
      'ForOfStatement': 2,
      'ForStatement': 2,
      'FunctionDeclaration': 4,
      'FunctionExpression': 0,
      'Identifier': 15,
      'IfStatement': 2,
      'Import': 16,
      'ImportDeclaration': 4,
      'ImportDefaultSpecifier': 6,
      'ImportNamespaceSpecifier': 6,
      'ImportSpecifier': 6,
      'LabeledStatement': 2,
      'LineComment': 7,
      'Literal': 3,
      'LogicalExpression': 0,
      'MemberExpression': 0,
      'MetaProperty': 17,
      'MethodDefinition': 18,
      'NewExpression': 0,
      'ObjectExpression': 0,
      'ObjectPattern': 5,
      'Program': 8,
      'Property': 9,
      'RestElement': 1,
      'ReturnStatement': 2,
      'SequenceExpression': 0,
      'SpreadElement': 1,
      'Super': 10,
      'SwitchCase': 11,
      'SwitchStatement': 2,
      'TaggedTemplateExpression': 0,
      'TemplateElement': 1,
      'TemplateLiteral': 3,
      'ThisExpression': 0,
      'ThrowStatement': 2,
      'TryStatement': 2,
      'UnaryExpression': 0,
      'UpdateExpression': 0,
      'VariableDeclaration': 4,
      'VariableDeclarator': 12,
      'WhileStatement': 2,
      'WithStatement': 2,
      'YieldExpression': 0,
      'StaticBlock' :  4,
      'ImportExpression' :  0,
      'ParenthesizedExpression' :  0,
}

// N-gram frequency calculation
function getNgramFreq(jsCode) {
    let ngram = {
        '0_0_2': 0,
        '0_15_15': 0,
        '2_13_2': 0,
        '15_0_3': 0,
        '15_0_15': 0,
        '15_15_15': 0
    };

    if (!jsCode) return ngram;

    let ast;
    try {
        ast = esprima.parseScript(jsCode);
    } catch (error) {
        console.log("Invalid script");
        return ngram;
    }

    const { ast: nodeTypes } = treewalk(ast);
    const validPatterns = new Set([
        '0_0_2', '0_15_15', '2_13_2', '15_0_3', '15_0_15', '15_15_15'
    ]);

    const ngramSum = Math.max(0, nodeTypes.length - 2);

    // Iterate through the node types starting from the third element
    for (let i = 2; i < nodeTypes.length; i++) {
        const prevType1 = ngramDict[nodeTypes[i - 2]];
        const prevType2 = ngramDict[nodeTypes[i - 1]];
        const currentType = ngramDict[nodeTypes[i]];

        const pattern = `${prevType1}_${prevType2}_${currentType}`;

        if (validPatterns.has(pattern)) {
            // Increment the count for the valid n-gram pattern
            ngram[pattern] = (ngram[pattern] || 0) + 1;
        }
    }
    // Normalize n-gram frequencies
    for (const pattern in ngram) {
        ngram[pattern] /= ngramSum;
    }

    return ngram;
}

// Function to walk through the AST and collect node types
function treewalk(ast) {
    const nodes = [];
    (function walk(node) {
      if (!node) return;
      nodes.push(node.type); // Collect node types
      for (const key in node) {
        if (Array.isArray(node[key])) {
          node[key].forEach((child) => walk(child));
        } else if (typeof node[key] === 'object' && node[key] !== null) {
          walk(node[key]);
        }
      }
    })(ast);
    return { ast: nodes };
}