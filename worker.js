const { parentPort, workerData } = require('worker_threads');
const { PromiseSocket } = require("promise-socket");
const net = require('net');
const runner = require('./runner');

const username = workerData.username;
const key = workerData.key;
const hex = workerData.hex;

const runnerInstance = new runner.AVRRunner(hex);
runnerInstance.execute(cpu => { });

// Function to start mining
async function startMining(socket, workerData) {
    let promiseSocket = new PromiseSocket(socket);

    socket.write("JOB," + username + ",AVR," + key);
    let job = await promiseSocket.read();

    parentPort.postMessage("New Job: " + job.replace(/\r?\n|\r/g, " "));
    runnerInstance.transmitString(job);
    let firstCall = true;
    let totalstr = '';

    runnerInstance.usart.onByteTransmit = async (value) => {
        totalstr += String.fromCharCode(value);
        if (firstCall) {
            firstCall = false;
            setTimeout(async () => {
                job = totalstr.split(",");

                const computetime = Math.round(parseInt(job[1], 2) / 1000000 * 100000) / 100000;
                const hashrate_test = Math.round(parseInt(job[0], 2) / computetime * 100) / 100;

                socket.write(
                    parseInt(job[0], 2) + "," +
                    hashrate_test + "," +
                    'Official AVR Miner 4.0' + "," +
                    job[2] + "," +
                    job[2]
                );

                const str = await promiseSocket.read() || "BAD";

                if (str !== "BAD") {
                    workerData.accepted += 1;
                } else {
                    workerData.rejected += 1;
                }
                parentPort.postMessage(`${str.replace(/\r?\n|\r/g, " ")} (+${workerData.accepted}) (-${workerData.rejected})`);

                socket.write("JOB," + username + ",AVR," + key);
                job = await promiseSocket.read();
                parentPort.postMessage("New Job: " + job.replace(/\r?\n|\r/g, " "));
                runnerInstance.transmitString(job);

                firstCall = true;
                totalstr = '';
            }, 3000);
        }
    };
}

// Worker data and create socket
let localWorkerData = {};
localWorkerData.rejected = 0;
localWorkerData.accepted = 0;
let socket = new net.Socket();
socket.setEncoding("utf8");
socket.setTimeout(5000);

// Connect to pool
fetch("https://server.duinocoin.com/getPool")
    .then(res => res.json())
    .then(data => {
        socket.connect(data.port, data.ip);
    })
    .catch(err => {
        parentPort.postMessage('Error connecting to pool: ' + err.message);
    });

// Start mining when job received
socket.once("data", (data) => {
    startMining(socket, localWorkerData);
});
