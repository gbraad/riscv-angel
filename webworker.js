// this code will run in a separate worker and interface with the run.html 
// page's DOM through message passing

importScripts("lib/closure-compiled/long.js");
goog.require("goog.math.Long");

importScripts("lib/javascript-biginteger/biginteger.js");
Long = goog.math.Long;

importScripts("devices/character.js", "lib/binfile/binfile.js", "syscall.js", 
        "mappings.js", "utils.js", "mmu.js", "trap.js", "elfload.js", "inst.js",
        "cpu.js", "elfrun.js");

//onmessage = function(oEvent) {
//            // handle term event
//            console.log(oEvent.data);
//};

self.addEventListener("message", function (oEvent) {
    if (oEvent.data.type == "r") {
        //continue running
        readTest.push("\n");
        runLoop();
    } else if (oEvent.data.type == "u") {
        // copy user input
        DAT = oEvent.data.inp;
        if (DAT == 'THIS_IS_ESC') {
            readTest.push(DAT);
        } else {
            for (var x = 0; x < DAT.length; x++) {
                readTest.push(DAT.charAt(x));
            }
        }
        runLoop();
    }
}, false);

function runCodeC(userIn) {
    //compilestat = document.getElementById("compilestatus");
    //compilestat.innerHTML = "Compile Status: Compiling, waiting for server response.";
    filesList = ["lib/riscv_compiled/vmlinux" ];

    handle_file_continue(filesList);

    RISCV = new CPU();
}

function handle_file_continue(filesList) {
    //document.getElementById("testresult").innerHTML = "ELF not loaded";
    //tab = document.getElementById("regtable");
    //elfproptab = document.getElementById("elfprops");
    //debugtab = document.getElementById("debugprops");

    // execution pause
    pauseExec = false;

    GetBinaryFile(filesList[0], chainedFileLoader, filesList.slice(1, filesList.length));
}

function runLoop() {
    cont = true;
    while(cont){
        cont = elfRunNextInst();
    }
}

runCodeC();
