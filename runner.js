const { avrInstruction, AVRTimer, CPU, timer0Config, AVRUSART, usart0Config, AVRIOPort, portBConfig, portCConfig, portDConfig } = require("avr8js");
const FLASH = 0x8000;

function loadHex(source, target) {
    for (const line of source.split('\n')) {
        if (line[0] === ':' && line.substr(7, 2) === '00') {
            const bytes = parseInt(line.substr(1, 2), 16);
            const addr = parseInt(line.substr(3, 4), 16);
            for (let i = 0; i < bytes; i++) {
                target[addr + i] = parseInt(line.substr(9 + i * 2, 2), 16);
            }
        }
    }
}

class AVRRunner {
    constructor(hex) {
        this.program = new Uint16Array(FLASH);
        loadHex(hex, new Uint8Array(this.program.buffer));
        this.cpu = new CPU(this.program);
        this.timer = new AVRTimer(this.cpu, timer0Config);
        this.portB = new AVRIOPort(this.cpu, portBConfig);
        this.portC = new AVRIOPort(this.cpu, portCConfig);
        this.portD = new AVRIOPort(this.cpu, portDConfig);
        this.usart = new AVRUSART(this.cpu, usart0Config, this.MHZ);
        this.usart.onRxComplete = () => this.flushTXQueue();
        this.MHZ = 16e6;
        this.stopped = false;
        this.serialQueue = [];
    }

    async execute(callback) {
        this.stopped = false;
        while (true) {
            avrInstruction(this.cpu);
            this.cpu.tick();
            if (this.cpu.cycles % 500000 === 0) {
                callback(this.cpu);
                await new Promise(resolve => setTimeout(resolve, 0));
                if (this.stopped) {
                    break;
                }
            }
        }
    }

    flushTXQueue() {
        if (!this.usart.rxBusy && this.serialQueue.length) {
            this.usart.writeByte(this.serialQueue.shift());
        }
    }

    transmit(...values) {
        this.serialQueue.push(...values);
        this.flushTXQueue();
    }

    transmitString(value) {
        this.transmit(...Array.from(new TextEncoder().encode(value)));
    }

    stop() {
        this.stopped = true;
    }
}

module.exports = { AVRRunner, loadHex }