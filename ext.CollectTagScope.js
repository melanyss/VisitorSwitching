/*
 *  Author      : rui.machado@tealium.com
 *
 *  Scope       : Tealium Collect (/event endpoint)
 * 
 *  Condition   : n/a
 * 
 *  Description : "Visitor Switching" - Adds support for multiple users on a single device.
 * 
 *                Version 1.0
 *                  -Initial release
 *                  -When given keys or combination of are provided, it generates a new VID for CDH creating a new profile
 *                  -If a key or combination of was previously provided, it should reuse the previously associated VID
 *                  -key/combination and associated VID should be stored in local cookies for reuse
 * 
 */
 
/*
 *
 * Provide a list of all datalayer properties that defines the different ids
 *
 * E.G.:
 *      empty ([]):
 *              user id = vid
 *      1 property provided (["user_mobile_sha256"]):
 *              user id = user_mobile_sha256
 *      multiple properties provided (["user_mobile_sha256", "user_mobile_md5"...]):
 *              user id = user_mobile_sha256 + user_mobile_md5 + ...
 *
 */
var dataLayerIdentifiers = ["user_mobile_sha256_1", "user_mobile_md5_1"];




/*
 *
 * main logic, should not be changed
 *
 */

var helperMethods = {
    // persists data on  utag_main cookie
    setPersistData: function(key, value) {
        var ids = JSON.parse(utag.loader.RC("utag_main")["ids"] || '{}');
        ids[key] = value;
        utag.loader.SC("utag_main", { ids: JSON.stringify(ids) });
    },
    // gets data from utag_main cookie
    getPersistData: function(key) {
        var ids = JSON.parse(utag.loader.RC("utag_main")["ids"] || '{}');
        return ids[key];
    },
    // gets utag_main vid
    getVid: function() {
        return utag.loader.RC("utag_main")["v_id"] || "";
    },
    // generates a new guid for each new identifier
    generateGuid: function() {
        var gg1 = utag.ut.pad((new Date()).getTime(), 12);
            gg2 = "" + Math.random();
        gg1 += utag.ut.pad(gg2.substring(2, gg2.length), 16);
        try {
            gg1 += utag.ut.pad((navigator.plugins.length ? navigator.plugins.length : 0), 2);
            gg1 += utag.ut.pad(navigator.userAgent.length, 3);
            gg1 += utag.ut.pad(document.URL.length, 4);
            gg1 += utag.ut.pad(navigator.appVersion.length, 3);
            gg1 += utag.ut.pad(screen.width + screen.height + parseInt((screen.colorDepth) ? screen.colorDepth : screen.pixelDepth), 5)
        } catch (e) {
            gg1 += "12345"
        }
        return gg1;
    },
    // gets a guid for the provided identifier, persists known identifiers/guids on utag_main cookie
    // returns a new guid if new identifier
    // returns an existing guid based on known identifier
    getGuid: function(identifier) {
        var id = this.getPersistData(identifier);
        if(id) {
            return id;
        } else {
            var newId = this.generateGuid();
            this.setPersistData(identifier, newId);
            return newId;
        }
    }
}, 
// processes main logic
// returns an ID
process = function() {
    var keyId = "";
        
    // concatenate keys
    for(var i = 0; i < dataLayerIdentifiers.length; i++) {
        keyId += b[dataLayerIdentifiers[i]] || "";
    }
    
    // if custom key is present provide an ID for it
    if(keyId) {
        return {
            isNew: true,
            new: helperMethods.getGuid(keyId),
            old: b["cp.utag_main_v_id"],
            base: helperMethods.getVid()
        };
    }
    
    // if no custom key is present provide the default VID
    return {
        isNew: false,
        new: b["cp.utag_main_v_id"],
        old: b["cp.utag_main_v_id"],
        base: helperMethods.getVid()
    };
};
var processedIdentifiers = process();

/*
 * change all datalayer identifiers to the new ID
 */
if (b['tealium_visitor_id']) {
    b['tealium_visitor_id'] = processedIdentifiers.new;
}
if (b['_t_visitor_id']) {
    b['_t_visitor_id'] = processedIdentifiers.new;
}
if (b['cp.utag_main_v_id']) {
    b['cp.utag_main_v_id'] = processedIdentifiers.new;
}
if (b['ut.visitor_id']) {
    b['ut.visitor_id'] = processedIdentifiers.new;
}
if(processedIdentifiers.isNew) {
    b['main_profile_vid'] = processedIdentifiers.base;
}
/*
 * change tag template new visitor id to cope with DLE
 */
u.visitor_id = processedIdentifiers.new; 

