!function() {
    var e = ["identify", "page", "startAutoPage", "stopAutoPage", "startAutoIdentify", "stopAutoIdentify"];
    
    function t(o) {
        return Object.assign([], e.reduce(function(r, n) {
            return r[n] = function() {
                return o.push([n, [].slice.call(arguments)]), o
            }, r
        }, {}))
    }
    
    window.unify || (window.unify = t(window.unify));
    window.unifyBrowser || (window.unifyBrowser = t(window.unifyBrowser));
    
    var n = document.createElement("script");
    n.async = !0;
    n.setAttribute("src", "https://tag.unifyintent.com/v1/URbJ4p7g2b1huniGxT8HcA/script.js");
    n.setAttribute("data-api-key", "wk_YbNMAb89_ErhtGc2t7wWokhRTmuKFcL7UE2NwWgfd");
    n.setAttribute("id", "unifytag");
    (document.body || document.head).appendChild(n);
}();