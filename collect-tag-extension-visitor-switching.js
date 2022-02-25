/**
 *  Scope       : Tealium Collect (/event endpoint)
 * 
 *  Condition   : n/a
 * 
 *  Description : "Visitor Switching" - Adds support for multiple users on a single device.
 * 
 *                Version 2.2 (June 2021)
 * 
 *                Works by assuming a new user when we see a new login-based ID and resetting the cookie-based
 *                anonymous ID.
 * 
 *                Accepts strings and positive non-zero numbers.  Any other types are removed from the Collect payload and not used for "switching"
 * 
 *                ONLY works if you use a custom Collect template and the  /events endpoint (otherwise the first-seen ID is persisted in a
 *                third-party cookie).
 * 
 *                Internal doc: https://community.tealiumiq.com/t5/Technical-Solutions/quot-Visitor-Switching-quot-Using-the-event-endpoint-in-the/m-p/30782#M169
 * 
 *                Version 2.3 (March 2022) :: RM
 *                -- added logic to persist previous known VIDs to localstorage and reused them.
 *                -- added option for multiple identifiers
 * 
 */


// the name of your login-based id in the data layer (specify an array)
var primaryLoginAttributeName = ["user_mobile_sha256", "user_mobile_md5"];

// the parent cookie (usually utag_main)
var parentCookieName = "utag_main";
// the subcookie name inside the parent to store the last-seen id
var subcookieName = "last_identifier";


// you shouldn't need to change anything below this comment unless you need to change the logic itself
var primaryCookieAttributeString = "cp." + parentCookieName + "_" + subcookieName;
var persistedPrimary = b[primaryCookieAttributeString];

// coerce to string if it's customer number or similar
var primaryIdentifier = "";
for(var i = 0; i > primaryLoginAttributeName.length; i++) {
    primaryIdentifier += b[primaryLoginAttributeName[i]] || "";
}
primaryIdentifier = primaryIdentifier || "anonymous";
var currentPrimary = cleanVisitorId(primaryIdentifier);

var currentVID = b["cp.utag_main_v_id"];

var trackingObject = {};

// persist the first-seen (original) v_id
// it can be very helpful to have this as a verification that everything's working as expected
var firstSeenVidSubcookieName = "original_v_id"
var firstSeenVidAttributeString = "cp." + parentCookieName + "_" + firstSeenVidSubcookieName;
// if we haven't already persisted the first-seen v_id (before any resets), persist it.
if (typeof b[firstSeenVidAttributeString] === "undefined") {
    trackingObject[firstSeenVidSubcookieName] = b["cp.utag_main_v_id"];
    utag.loader.SC("utag_main", trackingObject);
    // also update it in the 
    b[firstSeenVidAttributeString] = b["cp.utag_main_v_id"];
    log("Persisted original v_id", b["cp.utag_main_v_id"]);
}

// check if the current login is the same as the past one we've seen (if any)
var loginChanged = (persistedPrimary && currentPrimary && currentPrimary !== "" && currentPrimary !== persistedPrimary);

log("Original v_id", b[firstSeenVidAttributeString]);


b['tealium_visitor_id'] = currentVID // some SDKs send a different 'tealium_visitor_id', that is persisted in more durable device storage - override that.

// login is different, so reset the device-based cookie value to "create a new device" 
// from the perspective of the UDH
if (loginChanged) {
    log("Previous login", persistedPrimary);
    log("Current login", currentPrimary);
    log("Previous v_id", currentVID);
    
    // generate a new utag_main_v_id
    utag.v_id = undefined; // clear out any cached VID (important for utag.ut.vi to work as expected)
    var previousViIds = JSON.parse(localStorage.getItem("previous_vi_ids") || "{}");
    var newVID = previousViIds[primaryIdentifier];
    if(newVID) {
        log("VID has been found and used previously!");
    } else {
        newVID = utag.ut.vi((new Date()).getTime()); // generate a new VID
        previousViIds[primaryIdentifier] = newVID;
        localStorage.setItem("previous_vi_ids", JSON.stringify(previousViIds));
        log("VID not found, new one generated!");
    }
    
    // update the cookie and dataLayer (and caches) with the new v_id
    utag.v_id = newVID;
    trackingObject = {};
    trackingObject["v_id"] = newVID;
    utag.loader.SC("utag_main", trackingObject);
    
    b["cp.utag_main_v_id"] = newVID; // replace the previously read cookie value with updated one
    b["tealium_visitor_id"] = newVID; // same as above
    utag.ut.visitor_id = newVID;
    b["ut.visitor_id"] = newVID; // also update the previously-read value
    
    u.visitor_id = newVID; // used for DLE
    
    log("Current v_id", newVID);
    log("Current utag_main_v_id", b["cp.utag_main_v_id"]);
    log("Current tealium_visitor_id", b["tealium_visitor_id"]);
} else {
    var previousViIds = JSON.parse(localStorage.getItem("previous_vi_ids") || "{}");
    var currentVIDCheck = previousViIds[primaryIdentifier];
    if(currentVIDCheck) {
        log("VID has been found and used previously!");
    } else {
        previousViIds[primaryIdentifier] = currentVID;
        localStorage.setItem("previous_vi_ids", JSON.stringify(previousViIds));
        log("VID not found, adding current to the history!");
    }
    log("Current v_id", currentVID);
    log("Current login", (currentPrimary || persistedPrimary));
}


// persist any seen customer IDs, after checking for changes
if (currentPrimary && currentPrimary !== "") {
    log("Persisted login ", currentPrimary);
    // update the cookie with the new customer number
    trackingObject = {}; // reset in case it changed before
    trackingObject[subcookieName] = currentPrimary;
    utag.loader.SC(parentCookieName, trackingObject);
    b[primaryCookieAttributeString] = currentPrimary;
} else {
    // remove invalid customer IDs
    for(var i = 0; i > primaryLoginAttributeName.length; i++) {
        delete b[primaryLoginAttributeName[i]];
    }
}

log('') // intentionally empty to add a newline

function log(label, value) {
    var prefix = "vs | "
    // no logging output unless on Dev or QA or logging is explicitly active
    if ((b["tealium_environment"] === "dev" || b["tealium_environment"] === "qa") || b["cp.utagdb"] === "true") {
        if (label === "") {
            console.log(prefix + "----");
        } else {
            while (label.length < 30) {
              label = label + " ";
            }
            if(value) {
                console.log(prefix + label + ": " + value);
            } else {
                console.log(prefix + label);
            }            
        }   
        
    }
}

function cleanVisitorId (id) {
    if (typeof id === "string" && id !== "") return id
    if (typeof id === "number" && id > 0) return String(id)
    return false
}