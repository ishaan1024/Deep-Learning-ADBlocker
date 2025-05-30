import { parse } from 'tldts';
import * as tf from '@tensorflow/tfjs';

let fqdnEmbeddings = {};
let model = null;

// Function to load FQDN Embeddings
async function loadEmbeddings() {
    try {
        const url = chrome.runtime.getURL("fqdn_embeddings.json");
        const response = await fetch(url);
        fqdnEmbeddings = await response.json();
        console.log('FQDN Embeddings loaded successfully.');
    } catch (error) {
        console.error('Error loading FQDN embeddings:', error);
    }
}

// Function to get FQDN character embeddings safely
async function getEmbedding(char) {
    if (!fqdnEmbeddings){
        await loadEmbeddings();
    }
    return fqdnEmbeddings[char]
}

// Function to load and store the TensorFlow.js model
async function loadModel() {
    try {
        model = await tf.loadLayersModel(chrome.runtime.getURL('classifier/model.json'));
        console.log('Model loaded successfully.');
        await model.save('indexeddb://model');
        console.log('Model saved to IndexedDB');
    } catch (error) {
        console.error('Error loading the model:', error);
    }
}

// Function to get predictions safely
async function getPrediction(features) {
    try {
        if (!model) {
            console.warn("Model not loaded yet. Loading now...");
            model = await tf.loadLayersModel('indexeddb://model');
        }

        const inputTensor = tf.tensor2d([features]);

        const prediction = model.predict(inputTensor);
        const predictionData = prediction.dataSync()[0];

        inputTensor.dispose();
        prediction.dispose();

        return predictionData;
    } catch (error) {
        console.error("Error making prediction:", error);
        return null;
    }
}

// Listen for messages from the content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'getEmbedding') {
        getEmbedding(message.char).then(embedding => {
            sendResponse({ success: true, embedding });
        });
    } else if (message.type === 'getPrediction') {
        getPrediction(message.features).then(prediction => {
            sendResponse({ success: true, prediction });
        });
        return true;  // Keep the messaging channel open for async response
    } else if (message.type === 'parse') {
        const parsedDomain = parse(message.url).domain;
        sendResponse({ success: true, parsed: parsedDomain });
    } else {
        sendResponse({ success: false, message: 'Unknown request type' });
    }
    return true; // Ensure async responses work
});

// Listen for tab reload requests
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "reload") {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length > 0) {
                chrome.tabs.reload(tabs[0].id);
                sendResponse({ success: true });
            }
        });
        return true;  // Keep response channel open
    }
});

// Load data when the background script starts
(async () => {
    await loadEmbeddings();
    await loadModel();
})();