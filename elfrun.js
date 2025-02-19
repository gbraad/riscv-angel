// run one instruction at a time, isolate from elfload

readTest = [];
tryCount = 0;
lastTimeSlot = (new Date()).getTime()/1000;

stopCount = 10000;

lastCharWritten = 0;

// ASSUME GLOBAL ACCESS TO RISCV
function elfRunNextInst() {
    var instVal;

    if (!(RISCV.instcount & 0xFFFFF)) {
        var ctime = (new Date()).getTime()/1000;
        postMessage({"type": "m", "d": 1.048576 / (ctime - lastTimeSlot)});
        lastTimeSlot = ctime;
    }

    // handle special cases @ cpu_idle
    if (signed_to_unsigned(RISCV.pc) == 0x80152b58 && readTest.length != 0) {
        if (readTest[0]  == 'THIS_IS_ESC') {
            readTest[0] = String.fromCharCode(0x1b);
            lastCharWritten = 1;
        }
        RISCV.priv_reg[PCR["CSR_FROMHOST"]["num"]] = new Long(0x100 | (readTest.shift().charCodeAt(0) & 0xFF), 0x01000000);
        RISCV.priv_reg[PCR["CSR_STATUS"]["num"]] = RISCV.priv_reg[PCR["CSR_STATUS"]["num"]] | 0x40000000;
        var InterruptException = new RISCVTrap("Host interrupt");
        handle_trap(InterruptException);
    } else if (signed_to_unsigned(RISCV.pc) == 0x80152b58) {
        // wait for user input
        tryCount += 1;
    }


    if (tryCount == stopCount) {
        tryCount = 0;
        if (lastCharWritten == 0x1) {
            lastCharWritten = 0x0;
            RISCV.priv_reg[PCR["CSR_COMPARE"]["num"]] = RISCV.priv_reg[PCR["CSR_COUNT"]["num"]].add(new Long(100000, 0x0));
            stopCount = 200000;
        } else {
            stopCount = 10000;
            return false;
        }
    }

    // set last PC value for comparison
    RISCV.oldpc = RISCV.pc;
    
    try {
        //instVal = RISCV.load_inst_from_mem(signExtLT32_64(RISCV.pc, 31));
        instVal = RISCV.load_inst_from_mem(new Long(RISCV.pc, RISCV.pc >> 31));//            signExtLT32_64(RISCV.pc, 31));
        var inst = new instruction(instVal);
        runInstruction(inst); // , RISCV);
    } catch(e) {
        // trap handling
        if (e.e_type === "RISCVTrap") {
            if (e.message === "Floating-Point Disabled") {
                // do nothing
                //console.log("ignoring FP instruction at: " + stringIntHex(RISCV.pc));
                RISCV.pc += 4;
            } else {
                //console.log("HANDLING TRAP: " + e.message);
                handle_trap(e);
            }
        } else {
            throw e;
        }
    }

    // handle interrupts here. DO NOT put this in inst.js (exceptions will break interrupts)
    if ((RISCV.priv_reg[PCR["CSR_STATUS"]["num"]] & SR["SR_EI"]) != 0x0) {
        // interrupts are enabled
        if (((RISCV.priv_reg[PCR["CSR_STATUS"]["num"]] >>> 16) & 0x80) != 0x0) {
            // timer interrupt is enabled
            if (RISCV.priv_reg[PCR["CSR_COUNT"]["num"]].equals(RISCV.priv_reg[PCR["CSR_COMPARE"]["num"]])) {
                // set IP bit for timer interrupt
                RISCV.priv_reg[PCR["CSR_STATUS"]["num"]] = RISCV.priv_reg[PCR["CSR_STATUS"]["num"]] | 0x80000000;
                var InterruptException = new RISCVTrap("Timer interrupt");
                handle_trap(InterruptException);
            }
        }

    }


    // [todo] - register syscall handler

    var toHostVal = RISCV.priv_reg[PCR["CSR_TOHOST"]["num"]];
    // check toHost, output to JS console, clear it
    if (!toHostVal.isZero()){
        //console.log("Output on toHost:");
        //console.log(stringLongHex(RISCV.priv_reg[PCR["CSR_TOHOST"]["num"]]));

        // now on every run, we need to check to see if a syscall is happening
        // check device / cmd
        var device = (toHostVal.getHighBits() >> 24) & 0xFF;
        var cmd = (toHostVal.getHighBits() >> 16) & 0xFF;
        var payload = new Long(toHostVal.getLowBits(), toHostVal.getHighBits() & 0xFFFF);
        if (device == 0x0) {
            // this is a syscall
            // this is for normal syscalls (not testing)
            if (cmd == 0x0) {
                handle_syscall(payload);
            } else if (cmd == 0xFF) {

                var addr = payload.shiftRightUnsigned(8); // hardcoded from log2(MAX_COMMANDS [256])
                var what = payload.getLowBits() & 0xFF;

                if (what == 0xFF) {
                    var toWrite = "syscall_proxy";
                }
                if (what == 0x0) {
                    var toWrite = "syscall";
                } 
                for (var i = 0; i < toWrite.length; i++) {
                    RISCV.memory[addr.getLowBits() + i] = toWrite.charCodeAt(i) & 0xFF;
                }
                RISCV.memory[addr.getLowBits() + toWrite.length] = 0x00;
                RISCV.priv_reg[PCR["CSR_FROMHOST"]["num"]] = Long.ONE;
            }
        } else if (device == 0x1) {
            // terminal, but ignore the enumeration
            if (cmd == 0x0) {
                // this is read
                // we don't actually handle them here
            } else if (cmd == 0x1) {
                // this is a write
               postMessage({"type": "t", "d": payload.getLowBits() & 0xFF});
            } else if (cmd == 0xFF) {
               // write "bcd" (block character device) to pbuf here
                var addr = payload.shiftRightUnsigned(8); // hardcoded from log2(MAX_COMMANDS [256])
                var what = payload.getLowBits() & 0xFF;

                if (what == 0xFF) {
                    var toWrite = "bcd";
                }
                if (what == 0x0) {
                    var toWrite = "read";
                } 
                if (what == 0x1) {
                    var toWrite = "write";
                }

                for (var i = 0; i < toWrite.length; i++) {
                    RISCV.memory[addr.getLowBits() + i] = toWrite.charCodeAt(i) & 0xFF;
                }
                RISCV.memory[addr.getLowBits() + toWrite.length] = 0x00;

                RISCV.priv_reg[PCR["CSR_FROMHOST"]["num"]] = Long.ONE;
            } else {
               throw new RISCVError("Other term features not yet implemented " + stringIntHex(cmd)); 
            } 
        } else if (cmd == 0xFF) {
            // try to override enumeration
            //if (device == 0x0) {
            //    // need to write "bcd" to pbuf here

                var addr = payload.shiftRightUnsigned(8); // hardcoded from log2(MAX_COMMANDS [256])
                var what = payload.getLowBits() & 0xFF;

                if (what == 0xFF) {
                    var toWrite = "";
                }
                for (var i = 0; i < toWrite.length; i++) {
                    RISCV.memory[addr.getLowBits() + i] = toWrite.charCodeAt(i) & 0xFF;
                }
                RISCV.memory[addr.getLowBits() + toWrite.length] = 0x00;

                RISCV.priv_reg[PCR["CSR_FROMHOST"]["num"]] = Long.ONE;

        } else {
            // unknown device, crash
            console.log("device " + stringIntHex(device));
            console.log("cmd " + stringIntHex(cmd));
            console.log("payload " + stringIntHex(payload));
            console.log("current PC " + stringIntHex(RISCV.pc));
            console.log("last PC " + stringIntHex(RISCV.oldpc));
            throw new RISCVError("unknown device/command combo");
        }

        RISCV.priv_reg[PCR["CSR_TOHOST"]["num"]] = Long.ZERO;
    } 
    return true;
   
}
