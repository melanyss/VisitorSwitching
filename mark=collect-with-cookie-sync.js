//Configure this - change this to the number of days after which you want to rerun the Google Cookie Sync tag
//see https://docs.google.com/document/d/1eZH0xuOMpb0Cj9XPTxlf8lHTVHtf-hO8zBGTzfmz2WY/edit
var COOKIE_SYNC_FREQUENCY_DAYS = 7;

//do not change beyond this line

//extension visitor switch detection and Google Cookie Sync trigger based on visitor switching.
//Keeping this in a single extension as otherwise the order could be inadvertently changed if it were in multiple extensions

// Generate new visitor ID
var v = function() {
    var pad = function(a, b, c, d) {
        a = "" + ((a - 0).toString(16));
        d = '';
        if (b > a.length) {
            for (c = 0; c < (b - a.length); c++) {
                d += '0';
            }
        }
        return "" + d + a;
    };
    var d = new Date().getTime();
    var a = pad(d, 12);
    var b = "" + Math.random();
    a += pad(b.substring(2, b.length), 16);
    try {
        a += pad((navigator.plugins.length ? navigator.plugins.length : 0), 2);
        a += pad(navigator.userAgent.length, 3);
        a += pad(document.URL.length, 4);
        a += pad(navigator.appVersion.length, 3);
        a += pad(screen.width + screen.height + parseInt((screen.colorDepth) ? screen.colorDepth : screen.pixelDepth), 5);
    } catch (e) {
        utag.DB(e);
        a += "12345";
    }
    return a;
};


// ------------------

// UtagMain utils

var storeInUtagMainCookie = function(b, name, value, storeSession) {
    var sess = storeSession ? ";exp-session" : "";
    var c = {};
    c[name] = value + sess;
    utag.loader.SC("utag_main", c);
    b['cp.utag_main_' + name] = value;
};

var deleteFromUtagMainCookie = function(b, name) {
    var c = {};
    c[name] = "";
    utag.loader.SC("utag_main", c, "d'");
    delete b['cp.utag_main_' + name];
};

var getFromUtagMainCookie = function(b, name, lowerCase) {
    var rv = b['cp.utag_main_' + name];
    if (rv && lowerCase) {
        rv = rv.toLowerCase();
    }
    return rv;
};

//localStorage check function
var lsTest = function() {
    var test = 'test';
    try {
        localStorage.setItem(test, test);
        localStorage.removeItem(test);
        return true;
    } catch (e) {
        return false;
    }
};

//localStorage get Function with fallback to utag_main cookie on b object if ls is not supported
var getFromStorage = function(b, key) {
    if (lsTest()) {
        return localStorage.getItem(key);
    } else {
        return getFromUtagMainCookie(b, key, false);
    }
};

var putInStorage = function(b, key, value) {
    if (lsTest()) {
        localStorage.setItem(key, value);
    } else {
        storeInUtagMainCookie(b, key, value, false);
    }
};

//  Read data direct from a cookie
function getDirectCookie(cname) {
    var name = cname + "=";
    var ca = document.cookie.split(';');
    for (var i = 0; i < ca.length; i++) {
        var c = ca[i];
        while (c.charAt(0) == ' ') {
            c = c.substring(1);
        }
        if (c.indexOf(name) == 0) {
            return c.substring(name.length, c.length);
        }
    }
    return "";
}

//  Get the specific bits of utag_main direct from the cookie and return as a string
var readDirectCookieValue = function(name) {
    var rv = '';
    try {
        var re = new RegExp('(^|\\$)' + name + ':[^$]+');
        var utag_main_string = getDirectCookie("utag_main");
        rv = utag_main_string.match(re)[0].split(':')[1];
    } catch (e) {
        rv = e.toString();
    }
    return rv;
};

// Define Constants
var LAST_LOGGED_MPN = "last_logged_in_mpn";
var CHANGED_AS_ID = "changed_as_id";
var V_ID = "v_id";

//for O2, MPN comes from digitalData.page.pageInfo.user, which will be flattened to digitaldata_page_pageInfo_user if that is present - that is a SHA256 of the MPN in 07xxxxxxxxx format
//else, if digitalData.customer.loginstatus: "Loggedin", then we can take digitalInfo.customer.contact_mpn, format and SHA it and that would be equivalent to digitalData.page.pageInfo.user
//note that digitalInfo is not data layer converted and so is not in b, it's just a JS variable on the page
//this is needed for the shop, upgrade journey if the user chooses to add a new number
if (b.digitaldata_page_pageInfo_user) {
    b.mpn_sha_from_dl = b.digitaldata_page_pageInfo_user;
} else if (b.digitaldata_customer_loginstatus == "Loggedin") {
    if (typeof(digitalInfo) == "object" && typeof(digitalInfo.customer) == "object" && typeof(digitalInfo.customer.contact_mpn) == "string") {
        var mpn = digitalInfo.customer.contact_mpn;
        if (/^447\d{9}$/.test(mpn)) {
            mpn = mpn.replace(/^44/, '0');
            b.mpn_sha_from_dl = utag.ut.sha256.SHA256(mpn).toString();
        }
    }
}


//salt and hash the mpn because we are going to want to store it in a cookie to detect a different user logging in and we don't want to store the mpn
//the mpn itself in digitaldata_page_pageInfo_user is already SHA256'd, so this is overkill, but maybe a good precaution since we are going to store this in a cookie
if (b.mpn_sha_from_dl) {
    b.salt_dbl_sha_mpn = utag.ut.sha256.SHA256('tealium' + b.mpn_sha_from_dl).toString();
}

// ---------------------------
if (b.salt_dbl_sha_mpn && getFromUtagMainCookie(b, LAST_LOGGED_MPN, true) && b.salt_dbl_sha_mpn !== getFromUtagMainCookie(b, LAST_LOGGED_MPN, true)) {
    //if logged in user has changed compared to cookie, then generate a new visitor id and store it in separate cookie
    //however, to avoid proliferation of visitor ids if the user continually swtiches (which they will under certain scenarios), we also cache the
    //visitor id in local storage (or the utag_main cookie, if the browser doesn't allow local storage) with the salt_dbl_sha_mpn as the key
    //local storage is sub-domain specific, but this still enables us to avoid generating a brand new visitor id every time the user switches
    var key = 'teal_vi_mpn_' + b.salt_dbl_sha_mpn;
    var vi = '';
    if (getFromStorage(b, key)) {
        vi = getFromStorage(b, key);
    } else {
        vi = v();
        //in this case, we will want to run the google cookie sync tag below, because we are
        //generating a new visitor id on this device
        //delete the cookie that tracks how long it has been, so that the code below
        //runs it again
        deleteFromUtagMainCookie(b, "google_cookie_sync_last_ran");
        putInStorage(b, key, vi);
    }
    storeInUtagMainCookie(b, CHANGED_AS_ID, vi, false);
}

//now remember the logged in user by mpn for next time
if (b.salt_dbl_sha_mpn) {
    storeInUtagMainCookie(b, LAST_LOGGED_MPN, b.salt_dbl_sha_mpn, false);
}

//track using the last known logged in user vid
if (getFromUtagMainCookie(b, CHANGED_AS_ID, false)) {
    b.tealium_visitor_id = getFromUtagMainCookie(b, CHANGED_AS_ID, false);
    b.tealium_vid_direct_changed_as_id = readDirectCookieValue(CHANGED_AS_ID);
    b.as_changed_as_id = 'true';
} else {
    b.tealium_visitor_id = getFromUtagMainCookie(b, V_ID, false);
    b.tealium_vid_direct_v_id = readDirectCookieValue(V_ID);
    b.as_changed_as_id = 'false';
}

if (/lib-audience$/.test(b.tealium_visitor_id) == false) {
    b.tealium_visitor_id += 'lib-audience';
}

b.as_original_visitor_id = getFromUtagMainCookie(b, V_ID, false);
if (/lib-audience$/.test(b.as_original_visitor_id) == false) {
    b.as_original_visitor_id += 'lib-audience';
}

//this is used by the very next dle call (have changed collect tag template)
utag.dle_visitor_id = b.tealium_visitor_id;
delete b['cp.utag_main_v_id'];

b.as_ut_visitor_id = 'missing';

if (b['ut.visitor_id'] && typeof(b['ut.visitor_id']) == 'string') {
    b.as_ut_visitor_id = b['ut.visitor_id'] + '[b]';
    if (b.tealium_visitor_id == 'undefinedlib-audience' && b.as_changed_as_id == 'false') {
        b.as_ut_visitor_id = b['ut.visitor_id'] + '[bu]';
        b.tealium_visitor_id = b['ut.visitor_id'] + 'lib-audience';
    }
}

if (utag && utag.data && utag.data['ut.visitor_id'] && typeof(utag.data['ut.visitor_id']) == 'string') {
    b.as_ut_visitor_id = utag.data['ut.visitor_id'] + '[u]';
    if (b.tealium_visitor_id == 'undefinedlib-audience' && b.as_changed_as_id == 'false') {
        b.as_ut_visitor_id = utag.data['ut.visitor_id'] + '[uu]';
        b.tealium_visitor_id = utag.data['ut.visitor_id'] + 'lib-audience';
    }
}

//GOOGLE COOKIE SYNC

//now that we know our tealium_visitor_id, we can trigger the google cookie sync tag
//load rules are ignored when triggering a tag like this, so we've set the load rule to the impossible load rule
//how long ago did we last do this?

//If cp.utag_main_google_cookie_sync_last_ran is not present, or if its date value is more than 7 days ago (and this 7 days is configurable as COOKIE_SYNC_FREQUENCY_DAYS at the top line of the extension), then…
var lastRanMS = b['cp.utag_main_google_cookie_sync_last_ran'] || '';
var msSince = null;
try {
    msSince = Date.now() - lastRanMS;
} catch (e) {}
if (typeof(msSince) !== "number" || isNaN(msSince)) {
    msSince = 100 * 24 * 60 * 60 * 1000;
}
var threshMs = COOKIE_SYNC_FREQUENCY_DAYS * 24 * 60 * 60 * 1000;
if (msSince > threshMs) {
    //Store b.tealium_visitor_id in a window variable for use in DLE call below -
    window.utag.googlecookiesync_visitorid = b.tealium_visitor_id;

    //Cookie Sync tag Fires - utag.view call to its tag ID directly.  This ignores load rules.  There is a loop to work out the tag ID.  We are in a library and so the tag ID cannot be hardcoded.
    //find the id for the Google Cookie Sync tag - this cannot be just hardcoded because we are in a library
    try {
        var r = null;
        for (var key in utag.loader.cfg) {
            if (utag.loader.cfg.hasOwnProperty(key)) {
                if (utag.loader.cfg[key].tid == 7127) {
                    r = key;
                    break;
                }
            }
        }
        if (r) {
            b.called_from_collect_tag = "true"; //this is to make the load rule for the cookie sync tag match
            utag.view(b, null, [r]);
            //We also store another cookie "utag_main_google_cookie_sync_last_ran" with the current date.
            storeInUtagMainCookie(b, "google_cookie_sync_last_ran", Date.now().toString());
        }
    } catch (e) {
        utag.DB(e);
    }

    //it's possible that the current site does not allow DLE (e.g. through Content Security Policy)
    //so we set a cookie that makes the collect tag keep trying DLE until the callback clears the cookie
    //this is not ideal - O2 need to allow DLE on all sites
    storeInUtagMainCookie(b, "dle_needed", "true");

    //WHATS GOING ON SERVER SIDE
    //In server CDH EventStream cookiesyncforward profile, it only forwards the call if a google_gid is set and there is no google_error.  This means we don't forward needless calls where the user's browser doesn't allow 3rd party cookies.
    //In server CDH lib-audience AudienceStream profile, once a cookie sync call is received;
    //The tealium_visitor_id from it is set in Visit String "Last Visitor ID from Cookie Sync Call - This Visit [str]"
    //The google_gid is set as Visitor String "Last Google ID [str]" as second enrichment - running it as the second enrichment means it overwrites the first enrichment.  .  This is the value that should be used in the connector.
    //The First enrichment on this Visitor String is from the cookie utag_main_google_id_this_device below.
    //The google_gid is also set as Visit String "Google ID - This Visit [str]".  This does not use the cookie and only has the single enrichment.  See below for rationale.  Do not use this value in the connector.
}
if (getFromUtagMainCookie(b, "dle_needed", true) == "true") {
    //Collect tag DLE is activated with 3 tries 2 seconds apart.
    u.enrichment_polling = 3;
    u.enrichment_polling_delay = 2000;
    window.tealium_enrichment = function(data) {
        console.log("Visitor Service Callback");
        var lastVisitorIDFromCookieSyncThisVisit = data.current_visit.properties['6155'] || "";
        deleteFromUtagMainCookie(b, "dle_needed");
        //In the DLE callback, if "Last Visitor ID from Cookie Sync Call - This Visit [str]" 6155 agrees with window.utag.googlecookiesync_visitorid, then we know that AudienceStream has been updated with the google_gid we've just sent it.  The value of the google_gid may not change, but that doesn't matter.  We know the google_gid in AS is from this device.
        if (window.utag.googlecookiesync_visitorid == lastVisitorIDFromCookieSyncThisVisit) {
            var googleIDThisVisit = data.current_visit.properties['6159'] || "";
            if (googleIDThisVisit) {
                //In this case, we store "Google ID - This Visit [str]" 6159 in a cookie on this device in utag_main - utag_main_google_id_this_device
                storeInUtagMainCookie(b, "google_id_this_device", googleIDThisVisit);
            }
        }
    };
}
