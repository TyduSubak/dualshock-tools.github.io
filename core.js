var device = null;
var devname = "";
var mode = 0;
var disable_btn = false;

function dec2hex(i) {
   return (i+0x10000).toString(16).substr(-4).toUpperCase();
}
function dec2hex32(i) {
   return (i+0x100000000).toString(16).substr(-8).toUpperCase();
}
function dec2hex8(i) {
   return (i+0x100).toString(16).substr(-2).toUpperCase();
}

async function ds4_info() {
    const view = await device.receiveFeatureReport(0xa3);

    var cmd = view.getUint8(0, true);
    if(cmd != 0xa3 || view.buffer.byteLength != 49)
        return false;

    var k1 = new TextDecoder().decode(view.buffer.slice(1, 0x10));
    var k2 = new TextDecoder().decode(view.buffer.slice(0x10, 0x20));
    k1=k1.replace(/\0/g, '');
    k2=k2.replace(/\0/g, '');

    var hw_ver_major= view.getUint16(0x21, true)
    var hw_ver_minor= view.getUint16(0x23, true)
    var sw_ver_major= view.getUint32(0x25, true)
    var sw_ver_minor= view.getUint16(0x25+4, true)
    var ooc = "unknown";

    try {
        const view = await device.receiveFeatureReport(0x81);
        ooc = "original";
    } catch(e) {
        ooc = "<font color='red'><b>clone</b></font>";
        disable_btn = true;
    }
    clear_info();
    append_info("Firmware Date: ", k1 + " " + k2);
    append_info("HW Version:", "" + dec2hex(hw_ver_major) + ":" + dec2hex(hw_ver_minor));
    append_info("SW Version:", dec2hex32(sw_ver_major) + ":" + dec2hex(sw_ver_minor));
    append_info("Device Type:", ooc);
    return true;
}

async function ds4_reset() {
    try {
        await device.sendFeatureReport(0xa0, alloc_req(0x80, [4,1,0]))
    } catch(error) {
    }
}

async function ds5_reset() {
    try {
        await device.sendFeatureReport(0x80, alloc_req(0x80, [1,1,0]))
    } catch(error) {
    }
}

async function ds4_calibrate_range_begin(perm_ch) {
try {
    if(perm_ch) {
        await ds4_nvunlock();
        if(await ds4_nvstatus() != 0) {
            close_calibrate_window();
            return show_popup("Range calibration failed: cannot unlock NV.");
        }
    }

    // Begin
    await device.sendFeatureReport(0x90, alloc_req(0x90, [1,1,2]))

    // Assert
    data = await device.receiveFeatureReport(0x91)
    data2 = await device.receiveFeatureReport(0x92)
    if(data.getUint32(0, false) != 0x91010201 || data2.getUint32(0, false) != 0x920102ff) {
        close_calibrate_window();
        return show_popup("Range calibration failed: error 1.");
    }
} catch(e) {
    await new Promise(r => setTimeout(r, 500));
    close_calibrate_window();
    return show_popup("Calibration failed: " + e);
}
}

async function ds4_calibrate_range_end(perm_ch) {
try {
    // Write
    await device.sendFeatureReport(0x90, alloc_req(0x90, [2,1,2]))

    data = await device.receiveFeatureReport(0x91)
    data2 = await device.receiveFeatureReport(0x92)
    if(data.getUint32(0, false) != 0x91010202 || data2.getUint32(0, false) != 0x92010201) {
        close_calibrate_window();
        return show_popup("Range calibration failed: error 3.");
    }

    if(perm_ch) {
        await ds4_nvlock();
        if(await ds4_nvstatus() != 1) {
            close_calibrate_window();
            return show_popup("Range calibration failed: cannot relock NV.");
        }
    }

    close_calibrate_window();
    show_popup("Range calibration completed");
} catch(e) {
    await new Promise(r => setTimeout(r, 500));
    close_calibrate_window();
    return show_popup("Calibration failed: " + e);
}
}

async function ds4_calibrate_sticks_begin(has_perm_changes) {
    try {
        if(has_perm_changes) {
            await ds4_nvunlock();
            if(await ds4_nvstatus() != 0) {
                show_popup("Calibration failed: cannot unlock NV.");
                return false;
            }
        }

        // Begin
        await device.sendFeatureReport(0x90, alloc_req(0x90, [1,1,1]))

        // Assert
        data = await device.receiveFeatureReport(0x91)
        data2 = await device.receiveFeatureReport(0x92)
        if(data.getUint32(0, false) != 0x91010101 || data2.getUint32(0, false) != 0x920101ff) {
            show_popup("Calibration failed: error 1.");
            return false;
        }

        return true;
    } catch(e) {
        await new Promise(r => setTimeout(r, 500));
        show_popup("Calibration failed: " + e);
        return false;
    }
}

async function ds4_calibrate_sticks_sample() {
    try {
        // Sample
        await device.sendFeatureReport(0x90, alloc_req(0x90, [3,1,1]))

        // Assert
        data = await device.receiveFeatureReport(0x91);
        data2 = await device.receiveFeatureReport(0x92);
        if(data.getUint32(0, false) != 0x91010101 || data2.getUint32(0, false) != 0x920101ff) {
            close_calibrate_window();
            d1 = dec2hex32(data.getUint32(0, false));
            d2 = dec2hex32(data2.getUint32(0, false));
            show_popup("Calibration failed: error 2 (got " + d1 + ", " + d2 + " at i=" + i + ")");
            return false;
        }
        return true;
    } catch(e) {
        await new Promise(r => setTimeout(r, 500));
        show_popup("Calibration failed: " + e);
        return false;
    }
}

async function ds4_calibrate_sticks_end(has_perm_changes) {
    try {
        // Write
        await device.sendFeatureReport(0x90, alloc_req(0x90, [2,1,1]))
        if(data.getUint32(0, false) != 0x91010101 || data2.getUint32(0, false) != 0x920101FF) {
            d1 = dec2hex32(data.getUint32(0, false));
            d2 = dec2hex32(data2.getUint32(0, false));
            show_popup("Calibration failed: error 3 (got " + d1 + ", " + d2 + " at i=" + i + ")");
            return false;
        }

        if(has_perm_changes) {
            await ds4_nvlock();
            if(await ds4_nvstatus() != 1) {
                show_popup("Calibration failed: cannot relock NV.");
                return false;
            }
        }

        return true;
    } catch(e) {
        await new Promise(r => setTimeout(r, 500));
        show_popup("Calibration failed: " + e);
        return false;
    }
}

async function ds4_calibrate_sticks() {
try {
    set_progress(0);

    // Begin
    await device.sendFeatureReport(0x90, alloc_req(0x90, [1,1,1]))

    // Assert
    data = await device.receiveFeatureReport(0x91)
    data2 = await device.receiveFeatureReport(0x92)
    if(data.getUint32(0, false) != 0x91010101 || data2.getUint32(0, false) != 0x920101ff) {
        close_calibrate_window();
        return show_popup("Calibration failed: error 1.");
    }

    set_progress(10);
    await new Promise(r => setTimeout(r, 100));

    for(var i=0;i<3;i++) {
        // Sample
        await device.sendFeatureReport(0x90, alloc_req(0x90, [3,1,1]))

        // Assert
        data = await device.receiveFeatureReport(0x91);
        data2 = await device.receiveFeatureReport(0x92);
        if(data.getUint32(0, false) != 0x91010101 || data2.getUint32(0, false) != 0x920101ff) {
            close_calibrate_window();
            d1 = dec2hex32(data.getUint32(0, false));
            d2 = dec2hex32(data2.getUint32(0, false));
            return show_popup("Calibration failed: error 2 (got " + d1 + ", " + d2 + " at i=" + i + ")");
        }

        await new Promise(r => setTimeout(r, 500));
        set_progress(20 + i * 30);
    }

    // Write
    await device.sendFeatureReport(0x90, alloc_req(0x90, [2,1,1]))
    if(data.getUint32(0, false) != 0x91010101 || data2.getUint32(0, false) != 0x920101FF) {
        d1 = dec2hex32(data.getUint32(0, false));
        d2 = dec2hex32(data2.getUint32(0, false));
        close_calibrate_window();
        return show_popup("Calibration failed: error 3 (got " + d1 + ", " + d2 + " at i=" + i + ")");
    }

    set_progress(100);
    await new Promise(r => setTimeout(r, 500));
    close_calibrate_window()
    show_popup("Calibration completed successfully");
} catch(e) {
    await new Promise(r => setTimeout(r, 500));
    close_calibrate_window();
    return show_popup("Calibration failed: " + e);
}
}

async function ds4_nvstatus() {
    await device.sendFeatureReport(0x08, alloc_req(0x08, [0xff,0, 12]))
    data = await device.receiveFeatureReport(0x11)
    // 1: temporary, 0: permanent
    ret = data.getUint8(1, false);
    if(ret == 1) {
        $("#d-nvstatus").html("<font color='green'>locked</font>");
    } else if(ret == 0) {
        $("#d-nvstatus").html("<font color='red'>unlocked</font>");
    } else {
        $("#d-nvstatus").html("<font color='purple'>unk " + ret + "</font>");
    }
    return ret;
}

async function ds5_nvstatus() {
try {
    await device.sendFeatureReport(0x80, alloc_req(0x80, [3,3]))
    data = await device.receiveFeatureReport(0x81)
    ret = data.getUint32(1, false);
    if(ret == 0x03030201) {
        $("#d-nvstatus").html("<font color='green'>locked</font>");
        return 1; // temporary
    } else if(ret == 0x03030200) {
        $("#d-nvstatus").html("<font color='red'>unlocked</font>");
        return 0; // permanent
    } else {
        $("#d-nvstatus").html("<font color='purple'>unk " + dec2hex32(ret) + "</font>");
        return ret; // unknown
    }
} catch(e) {
    $("#d-nvstatus").html("<font color='red'>error</font>");
    return 2; // error
}
}

async function ds4_getbdaddr() {
    return "not implemented";
}

async function ds5_getbdaddr() {
try {
    await device.sendFeatureReport(0x80, alloc_req(0x80, [9,2]))
    data = await device.receiveFeatureReport(0x81)
    out = ""
    for(i=0;i<6;i++) {
        if(i >= 1) out += ":";
        out += dec2hex8(data.getUint8(4 + i, false));
    }
    $("#d-bdaddr").text(out);
    return out;
} catch(e) {
    $("#d-bdaddr").html("<font color='red'>error</font>");
    return "error";
}
}

async function ds4_nvlock() {
    await device.sendFeatureReport(0xa0, alloc_req(0xa0, [10,1,0]))
}

async function ds4_nvunlock() {
    await device.sendFeatureReport(0xa0, alloc_req(0xa0, [10,2,0x3e,0x71,0x7f,0x89]))
}

async function ds5_info() {
    const view = await device.receiveFeatureReport(0x20);

    var cmd = view.getUint8(0, true);
    if(cmd != 0x20 || view.buffer.byteLength != 64)
        return false;

    var build_date = new TextDecoder().decode(view.buffer.slice(1, 1+11));
    var build_time = new TextDecoder().decode(view.buffer.slice(12, 20));

    var fwtype     = view.getUint16(20, true);
    var swseries   = view.getUint16(22, true);
    var hwinfo     = view.getUint32(24, true);
    var fwversion  = view.getUint32(28, true);

    var deviceinfo = new TextDecoder().decode(view.buffer.slice(32, 32+12));
    var updversion = view.getUint16(44, true);
    var unk        = view.getUint16(46, true);

    var fwversion1 = view.getUint32(50, true);
    var fwversion2 = view.getUint32(54, true);
    var fwversion3 = view.getUint32(58, true);

    clear_info();

    append_info("Build Time: ", build_date + " " + build_time);
    append_info("Firmware Type:", "0x" + dec2hex(fwtype));
    append_info("SW Series:", "0x" + dec2hex(swseries));
    append_info("HW Info:", "0x" + dec2hex32(hwinfo));
    append_info("FW Version:", "0x" + dec2hex32(fwversion));
    //append_info("deviceinfo:", deviceinfo);
    append_info("UPD Version:", "0x" + dec2hex(updversion));
    //append_info("Unknown:", "0x" + dec2hex(unk));
    append_info("FW Version1:", "0x" + dec2hex32(fwversion1));
    append_info("FW Version2:", "0x" + dec2hex32(fwversion2));
    append_info("FW Version3:", "0x" + dec2hex32(fwversion3));
    return true;
}

async function ds5_calibrate_sticks_begin(has_perm_changes) {
    console.log("::ds5_calibrate_sticks_begin(" + has_perm_changes + ")");
    try {
        if(has_perm_changes) {
            await ds5_nvunlock();
            if(await ds5_nvstatus() != 0) {
                show_popup("Range calibration failed: cannot unlock NVS.");
                return false;
            }
        }
        // Begin
        await device.sendFeatureReport(0x82, alloc_req(0x82, [1,1,1]))
    
        // Assert
        data = await device.receiveFeatureReport(0x83)
        if(data.getUint32(0, false) != 0x83010101) {
            d1 = dec2hex32(data.getUint32(0, false));
            show_popup("Calibration failed: error 1 (got " + d1 + ").");
            return false;
        }
        return true;
    } catch(e) {
        await new Promise(r => setTimeout(r, 500));
        show_popup("Calibration failed: " + e);
        return false;
    }
}

async function ds5_calibrate_sticks_sample() {
    console.log("::ds5_calibrate_sticks_sample()");
    try {
        // Sample
        await device.sendFeatureReport(0x82, alloc_req(0x82, [3,1,1]))
        
        // Assert
        data = await device.receiveFeatureReport(0x83)
        if(data.getUint32(0, false) != 0x83010101) {
            d1 = dec2hex32(data.getUint32(0, false));
            show_popup("Calibration failed: error 2 (got " + d1 + ").");
            return false;
        }
        return true;
    } catch(e) {
        await new Promise(r => setTimeout(r, 500));
        show_popup("Calibration failed: " + e);
        return false;
    }
}

async function ds5_calibrate_sticks_end(has_perm_changes) {
    console.log("::ds5_calibrate_sticks_end(" + has_perm_changes + ")");
    try {
        // Write
        await device.sendFeatureReport(0x82, alloc_req(0x82, [2,1,1]))

        data = await device.receiveFeatureReport(0x83)
        if(data.getUint32(0, false) != 0x83010102) {
            d1 = dec2hex32(data.getUint32(0, false));
            show_popup("Calibration failed: error 3 (got " + d1 + ").");
            return false;
        }

        if(has_perm_changes) {
            await ds5_nvlock();
            if(await ds5_nvstatus() != 1) {
                show_popup("Range calibration failed: cannot relock NVS.");
                return false;
            }
        }
        return true;
    } catch(e) {
        await new Promise(r => setTimeout(r, 500));
        show_popup("Calibration failed: " + e);
        return false;
    }
}

async function ds5_calibrate_sticks() {
try {
    set_progress(0);

    // Begin
    await device.sendFeatureReport(0x82, alloc_req(0x82, [1,1,1]))

    // Assert
    data = await device.receiveFeatureReport(0x83)
    if(data.getUint32(0, false) != 0x83010101) {
        d1 = dec2hex32(data.getUint32(0, false));
        close_calibrate_window();
        return show_popup("Calibration failed: error 1 (got " + d1 + ").");
    }

    set_progress(10);

    await new Promise(r => setTimeout(r, 100));

    for(var i=0;i<3;i++) {
        // Sample
        await device.sendFeatureReport(0x82, alloc_req(0x82, [3,1,1]))

        // Assert
        data = await device.receiveFeatureReport(0x83)
        if(data.getUint32(0, false) != 0x83010101) {
            d1 = dec2hex32(data.getUint32(0, false));
            close_calibrate_window();
            return show_popup("Calibration failed: error 2 (got " + d1 + ").");
        }

        await new Promise(r => setTimeout(r, 500));
        set_progress(20 + i * 20);
    }

    await new Promise(r => setTimeout(r, 200));
    set_progress(80);

    // Write
    await device.sendFeatureReport(0x82, alloc_req(0x82, [2,1,1]))

    data = await device.receiveFeatureReport(0x83)
    if(data.getUint32(0, false) != 0x83010102) {
        d1 = dec2hex32(data.getUint32(0, false));
        close_calibrate_window();
        return show_popup("Calibration failed: error 3 (got " + d1 + ").");
    }

    set_progress(100);
    
    await new Promise(r => setTimeout(r, 500));
    close_calibrate_window()

    show_popup("Calibration completed successfully");
} catch(e) {
    await new Promise(r => setTimeout(r, 500));
    close_calibrate_window();
    return show_popup("Calibration failed: " + e);
}
}

async function ds5_calibrate_range_begin(perm_ch) {
try {
    if(perm_ch) {
        await ds5_nvunlock();
        if(await ds5_nvstatus() != 0) {
            close_calibrate_window();
            return show_popup("Range calibration failed: cannot unlock NVS.");
        }
    }

    // Begin
    await device.sendFeatureReport(0x82, alloc_req(0x82, [1,1,2]))

    // Assert
    data = await device.receiveFeatureReport(0x83)
    if(data.getUint32(0, false) != 0x83010201) {
        d1 = dec2hex32(data.getUint32(0, false));
        close_calibrate_window();
        return show_popup("Calibration failed: error 1 (got " + d1 + ").");
    }
} catch(e) {
    await new Promise(r => setTimeout(r, 500));
    close_calibrate_window();
    return show_popup("Calibration failed: " + e);
}
}

async function ds5_calibrate_range_end(perm_ch) {
try {
    // Write
    await device.sendFeatureReport(0x82, alloc_req(0x82, [2,1,2]))

    // Assert
    data = await device.receiveFeatureReport(0x83)
    if(data.getUint32(0, false) != 0x83010202) {
        d1 = dec2hex32(data.getUint32(0, false));
        close_calibrate_window();
        return show_popup("Calibration failed: error 1 (got " + d1 + ").");
    }

    if(perm_ch) {
        await ds5_nvlock();
        if(await ds5_nvstatus() != 1) {
            close_calibrate_window();
            return show_popup("Range calibration failed: cannot relock NVS.");
        }
    }

    close_calibrate_window();
    show_popup("Range calibration completed");
} catch(e) {
    await new Promise(r => setTimeout(r, 500));
    close_calibrate_window();
    return show_popup("Calibration failed: " + e);
}
}

async function ds5_nvlock() {
try {
    await device.sendFeatureReport(0x80, alloc_req(0x80, [3,1]))
    data = await device.receiveFeatureReport(0x83)
} catch(e) {
    await new Promise(r => setTimeout(r, 500));
    close_calibrate_window();
    return show_popup("NVSLock failed: " + e);
}
}

async function ds5_nvunlock() {
try {
    await device.sendFeatureReport(0x80, alloc_req(0x80, [3,2, 101, 50, 64, 12]))
    data = await device.receiveFeatureReport(0x83)
} catch(e) {
    await new Promise(r => setTimeout(r, 500));
    close_calibrate_window();
    return show_popup("NVSUnlock failed: " + e);
}
}

async function disconnect() {
    if(device == null)
        return;
    mode = 0;
    device.close();
    device = null;
    disable_btn = false;

    $("#offlinebar").show();
    $("#onlinebar").hide();
    $("#mainmenu").hide();
    close_calibrate_window();
}

function handleDisconnectedDevice(e) {
    console.log("Disconnected: " + e.device.productName)
    disconnect();
}

function gboot() {
    if (!("hid" in navigator)) {
        $("#offlinebar").hide();
        $("#onlinebar").hide();
        $("#missinghid").show();
        return;
    }

    $("#offlinebar").show();
    navigator.hid.addEventListener("disconnect", handleDisconnectedDevice);
}

function alloc_req(id, data=[]) {
    len = data.length;
    try {
        fr = device.collections[0].featureReports;
        fr.forEach((e) => { if(e.reportId == id) { len = e.items[0].reportCount; }});
    } catch(e) {
        console.log(e);
    }
    out = new Uint8Array(len);
    for(i=0;i<data.length && i < len;i++) {
        out[i] = data[i];
    }
    return out;
}

async function connect() {
try {
    $("#btnconnect").prop("disabled", true);

    let ds4v1 = { vendorId: 0x054c, productId: 0x05c4 };
    let ds4v2 = { vendorId: 0x054c, productId: 0x09cc };
    let ds5 = { vendorId: 0x054c, productId: 0x0ce6 };
    let ds5edge = { vendorId: 0x054c, productId: 0x0df2 };
    let requestParams = { filters: [ds4v1,ds4v2,ds5,ds5edge] };

    var devices = await navigator.hid.getDevices();
    if (devices.length == 0) {
        devices = await navigator.hid.requestDevice(requestParams);
    }
    
    if (devices.length == 0) {
        $("#btnconnect").prop("disabled", false);
        return;
    }

    if (devices.length > 1) {
        $("#btnconnect").prop("disabled", false);
        show_popup("Please connect only one controller at time.");
        return;
    }

    await devices[0].open();

    device = devices[0]

    var connected = false
    if(device.productId == 0x05c4) {
        if(await ds4_info()) {
            connected = true
            mode = 1;
            devname = "Sony DualShock 4 V1";
        }
    } else if(device.productId == 0x09cc) {
        if(await ds4_info()) {
            connected = true
            mode = 1;
            devname = "Sony DualShock 4 V2";
        }
    } else if(device.productId == 0x0ce6) {
        if(await ds5_info()) {
            connected = true
            mode = 2;
            devname = "Sony DualSense";
        }
    } else if(device.productId == 0x0df2) {
        if(await ds5_info()) {
            connected = true
            mode = 0;
            devname = "Sony DualSense Edge";
            disable_btn = true;
        }
    } else {
        $("#btnconnect").prop("disabled", false);
        show_popup("Connected invalid device: " + dec2hex(device.vendorId) + ":" + dec2hex(device.productId))
        disconnect();
        return;
    }

    if(connected) {
        $("#devname").text(devname + " (" + dec2hex(device.vendorId) + ":" + dec2hex(device.productId) + ")");
        $("#offlinebar").hide();
        $("#onlinebar").show();
        $("#mainmenu").show();
        $("#resetBtn").show();
        $("#d-nvstatus").text = "Unknown";
        $("#d-bdaddr").text = "Unknown";
    }

    if(disable_btn) {
        if(device.productId == 0x0df2) {
            show_popup("Calibration of the DualSense Edge is not currently supported.");
        } else {
            show_popup("The device appears to be a DS4 clone. All functionalities are disabled.");
        }
    }

    $(".ds-btn").prop("disabled", disable_btn);

    $("#btnconnect").prop("disabled", false);
} catch(error) {
    $("#btnconnect").prop("disabled", false);
    show_popup("Error: " + error);
    return;
}
}

var curModal = null

async function multi_reset() {
    if(mode == 1) 
        ds4_reset();
    else
        ds5_reset();
}

async function multi_getbdaddr() {
    if(mode == 1) 
        ds4_getbdaddr();
    else
        ds5_getbdaddr();
}

async function multi_nvstatus() {
    if(mode == 1) 
        ds4_nvstatus();
    else
        ds5_nvstatus();
}

async function multi_nvsunlock() {
    if(mode == 1) {
        await ds4_nvunlock();
        await ds4_nvstatus();
    } else {
        await ds5_nvunlock();
        await ds5_nvstatus();
    }
}

async function multi_nvslock() {
    if(mode == 1) {
        await ds4_nvlock();
        await ds4_nvstatus();
    } else {
        await ds5_nvlock();
        await ds5_nvstatus();
    }
}

async function multi_calib_sticks_begin(pc) {
    if(mode == 1) 
        return ds4_calibrate_sticks_begin(pc);
    else
        return ds5_calibrate_sticks_begin(pc);
}

async function multi_calib_sticks_end(pc) {
    if(mode == 1) 
        return ds4_calibrate_sticks_end(pc);
    else
        return ds5_calibrate_sticks_end(pc);
}

async function multi_calib_sticks_sample() {
    if(mode == 1) 
        return ds4_calibrate_sticks_sample();
    else
        return ds5_calibrate_sticks_sample();
}

var last_perm_ch = 0
async function multi_calibrate_range(perm_ch) {
    if(mode == 0) 
        return;

    set_progress(0);
    curModal = new bootstrap.Modal(document.getElementById('rangeModal'), {})
    curModal.show();

    last_perm_ch = perm_ch

    await new Promise(r => setTimeout(r, 1000));

    if(mode == 1) 
        ds4_calibrate_range_begin(perm_ch);
    else
        ds5_calibrate_range_begin(perm_ch);
}

async function multi_calibrate_range_on_close() {
    if(mode == 1) 
        ds4_calibrate_range_end(last_perm_ch);
    else
        ds5_calibrate_range_end(last_perm_ch);
}


async function multi_calibrate_sticks() {
    if(mode == 0) 
        return;

    set_progress(0);
    curModal = new bootstrap.Modal(document.getElementById('calibrateModal'), {})
    curModal.show();

    await new Promise(r => setTimeout(r, 1000));

    if(mode == 1) 
        ds4_calibrate_sticks();
    else
        ds5_calibrate_sticks();
}

function close_calibrate_window() {
    if (curModal != null) {
        curModal.hide();
        curModal = null;
    }

    $("#calibCenterModal").modal("hide");
    cur_calib = 0;
    return;
}

function set_progress(i) {
    $(".progress-bar").css('width', '' + i + '%')
}

function clear_info() {
    $("#fwinfo").html("");
}

function append_info(key, value) {
    // TODO escape html
    var s = '<div class="hstack"><p>' + key + '</p><p class="ms-auto">' + value + '</p></div>';
    $("#fwinfo").html($("#fwinfo").html() + s);
}

function show_popup(text) {
    $("#popupBody").text(text);
    new bootstrap.Modal(document.getElementById('popupModal'), {}).show()
}

function calib_perm_changes() { return $("#calibPermanentChanges").is(':checked') }

function reset_calib_perm_changes() { 
    $("#calibPermanentChanges").prop("checked", false).parent().removeClass('active');
}

function close_new_calib() {
    $("#calibCenterModal").modal("hide");
    cur_calib = 0;
}

async function calib_step(i) {
    if(i < 1 || i > 7) return;

    var pc = calib_perm_changes();
    var ret = true;
    if(i >= 2 && i <= 6) {
        $("#btnSpinner").show();
        $("#calibNext").prop("disabled", true);
    }

    if(i == 2) {
        $("#calibNextText").text("Initializing...");
        await new Promise(r => setTimeout(r, 100));
        ret = await multi_calib_sticks_begin(pc);
    } else if(i == 6) {
        $("#calibNextText").text("Storing calibration...");
        await new Promise(r => setTimeout(r, 100));
        ret = await multi_calib_sticks_end(pc);
    } else if(i > 2 && i < 6){
        $("#calibNextText").text("Sampling...");
        await new Promise(r => setTimeout(r, 100));
        ret = await multi_calib_sticks_sample();
    }
    if(i >= 2 && i <= 6) {
        await new Promise(r => setTimeout(r, 200));
        $("#calibNext").prop("disabled", false);
        $("#btnSpinner").hide();
    }

    if(ret == false) {
        close_new_calib();
        return;
    }

    for(j=1;j<7;j++) {
        $("#list-" + j).hide();
        $("#list-" + j + "-calib").removeClass("active");
    }

    $("#list-" + i).show();
    $("#list-" + i + "-calib").addClass("active");

    if(i == 1) {
        $("#calibTitle").text("Stick center calibration");
        $("#calibNextText").text("Start");
    }
    else if(i == 6) {
        $("#calibTitle").text("Stick center calibration");
        $("#calibNextText").text("Done");
    }
    else {
        $("#calibTitle").html("Calibration in progress");
        $("#calibNextText").text("Continue");
    }
    if(i == 1 || i == 6)
        $("#calibCross").show();
    else
        $("#calibCross").hide();

}

var cur_calib = 0;
async function calib_open() {
    cur_calib = 0;
    reset_calib_perm_changes();
    await calib_next();
    new bootstrap.Modal(document.getElementById('calibCenterModal'), {}).show()
}

async function calib_next() {
    console.log(cur_calib);
    if(cur_calib == 6) {
        close_new_calib()
        return;
    }
    if(cur_calib < 6) {
        cur_calib += 1;
        await calib_step(cur_calib);
    }
}