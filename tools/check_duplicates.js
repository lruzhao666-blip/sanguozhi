#!/usr/bin/env node

const fs = require('fs');

function checkDuplicates(filePath) {
    let raw;
    try {
        raw = fs.readFileSync(filePath, 'utf-8');
    } catch (e) {
        console.error("Error reading file:", e.message);
        return;
    }

    let data;
    try {
        data = JSON.parse(raw);
    } catch (e) {
        console.error("Error parsing JSON:", e.message);
        return;
    }

    const counts = {};
    data.forEach(item => {
        counts[item.name] = (counts[item.name] || 0) + 1;
    });

    const duplicates = Object.keys(counts).filter(name => counts[name] > 1);

    if (duplicates.length > 0) {
        console.log("Found duplicates in new data:");
        duplicates.forEach(name => {
            console.log(`- ${name} (appears ${counts[name]} times)`);
            const duplicateItems = data.filter(item => item.name === name);
            duplicateItems.forEach((item, index) => {
                console.log(`  Instance ${index + 1}:`, item);
            });
        });
        return true;
    } else {
        console.log("No duplicates found in new data.");
        return false;
    }
}

if (process.argv[2]) {
    checkDuplicates(process.argv[2]);
} else {
    console.log("Usage: node check_duplicates.js <json_file>");
}
module.exports = checkDuplicates;
