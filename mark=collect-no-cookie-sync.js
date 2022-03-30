//extension visitor switch detection

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
var lsTest = function(){
    var test = 'test';
    try {
        localStorage.setItem(test, test);
        localStorage.removeItem(test);
        return true;
    } catch(e) {
        return false;
    }
};

//localStorage get Function with fallback to utag_main cookie on b object if ls is not supported
var getFromStorage = function(b, key){
  if (lsTest()){
    return localStorage.getItem(key);
  }
  else{
    return getFromUtagMainCookie(b, key, false);
  }
};

var putInStorage = function(b, key, value){
  if (lsTest()){
    localStorage.setItem(key, value);
  }
  else{
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
}
else if (b.digitaldata_customer_loginstatus == "Loggedin"){
    if (typeof(digitalInfo) == "object" && typeof(digitalInfo.customer) == "object" && typeof(digitalInfo.customer.contact_mpn) == "string"){
        var mpn = digitalInfo.customer.contact_mpn;
        if (/^447\d{9}$/.test(mpn)){
            mpn = mpn.replace(/^44/,'0');
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
    if (getFromStorage(b, key)){
      vi = getFromStorage(b, key);
    }
    else{
      vi = v();
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
