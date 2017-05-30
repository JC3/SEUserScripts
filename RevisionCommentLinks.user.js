// ==UserScript==
// @name         Revision Comment Links
// @namespace    https://stackexchange.com/users/305991/jason-c
// @version      1.00
// @description  Make URLs in revision comments clickable.
// @author       Jason C
// @include      /^https?:\/\/([^/]*\.)?stackoverflow\.com\/([^/]*\/)*revisions(\/.*)*$/
// @include      /^https?:\/\/([^/]*\.)?serverfault\.com\/([^/]*\/)*revisions(\/.*)*$/
// @include      /^https?:\/\/([^/]*\.)?superuser\.com\/([^/]*\/)*revisions(\/.*)*$/
// @include      /^https?:\/\/([^/]*\.)?stackexchange\.com\/([^/]*\/)*revisions(\/.*)*$/
// @include      /^https?:\/\/([^/]*\.)?askubuntu\.com\/([^/]*\/)*revisions(\/.*)*$/
// @include      /^https?:\/\/([^/]*\.)?stackapps\.com\/([^/]*\/)*revisions(\/.*)*$/
// @include      /^https?:\/\/([^/]*\.)?mathoverflow\.net\/([^/]*\/)*revisions(\/.*)*$/
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    $('.revision-comment').each(function(_, c) {
        c.innerHTML = linkify(c.innerText);
    });

    // https://stackoverflow.com/a/7123542 is good enough.
    function linkify (str) {
        // http://, https://, ftp://
        var urlPattern = /\b(?:https?|ftp):\/\/[a-z0-9-+&@#\/%?=~_|!:,.;]*[a-z0-9-+&@#\/%=~_|]/gim;
        // www. sans http:// or https://
        var pseudoUrlPattern = /(^|[^\/])(www\.[\S]+(\b|$))/gim;
        // Email addresses
        var emailAddressPattern = /[\w.]+@[a-zA-Z_-]+?(?:\.[a-zA-Z]{2,6})+/gim;
        return str
            .replace(urlPattern, '<a href="$&">$&</a>')
            .replace(pseudoUrlPattern, '$1<a href="http://$2">$2</a>')
            .replace(emailAddressPattern, '<a href="mailto:$&">$&</a>');
    }

})();