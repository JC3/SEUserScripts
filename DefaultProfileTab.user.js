// ==UserScript==
// @name         Sloppy default to profile view
// @namespace    https://meta.stackexchange.com/users/230261/jason-c
// @version      1.0
// @description  Switch user profile view to profile tab
// @author       Jason C
// @match        *://*.stackexchange.com/users/*
// @match        *://*.stackoverflow.com/users/*
// @match        *://*.superuser.com/users/*
// @match        *://*.serverfault.com/users/*
// @match        *://*.askubuntu.com/users/*
// @match        *://*.stackapps.com/users/*
// @match        *://*.mathoverflow.net/users/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    if (/\/users\/[0-9]+\/.*/.test(window.location) && !window.location.href.includes("tab=")) {
        if (window.location.href.includes("?"))
            window.location = window.location + "&tab=profile";
        else
            window.location = window.location + "?tab=profile";
    }

})();
