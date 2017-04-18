// ==UserScript==
// @name         Collapsible Text Blocks
// @namespace    http://stackexchange.com/users/305991/jason-c
// @version      1.0
// @description  Adds collapse/expand links to text blocks
// @author       Jason C
// @include http*://*.stackexchange.com*
// @include http*://*.stackoverflow.com*
// @include http*://stackoverflow.com*
// @include http*://*.superuser.com*
// @include http*://superuser.com*
// @include http*://*.serverfault.com*
// @include http*://serverfault.com*
// @include http*://*.stackapps.com*
// @include http*://stackapps.com*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    var EXPAND_TEXT = "Expand";
    var COLLAPSE_TEXT = "Collapse";
    var contentId = 1; // tracks block ids

    // comment this out if you don't want to apply to blockquotes
    $("div.post-text blockquote").each(function () { makeCollapsible(this); });

    // comment this out if you don't want to apply to code
    $("div.post-text pre").each(function () { makeCollapsible(this); });

    // ------------------------------------------------------------------------------

    window.collapseHandleClick = function (link, id) {
        var content = $(`#collapse-content-${id}`);
        content.slideToggle(function () {
            link.innerHTML = (content.css('display') == 'none') ? EXPAND_TEXT : COLLAPSE_TEXT;
        });
    };

    function makeCollapsible (el) {

        // the collapse link will be added to the blockquote
        var collapse = document.createElement("div");
        collapse.style.fontSize = "80%";
        collapse.style.position = "absolute";
        collapse.style.marginTop = "-2.8ex";
        collapse.style.background = "rgba(255, 255, 255, 0.25)";
        collapse.innerHTML = `<p>[ <a href="javascript:void(0)" onclick="collapseHandleClick(this, ${contentId})">${COLLAPSE_TEXT}</a> ]</p>`;

        // the blockquote's normal contents will be moved into a child div
        var content = document.createElement("div");
        content.id = `collapse-content-${contentId}`;
        $(content).append($(el).children());

        el.appendChild(collapse);
        el.appendChild(content);

        ++ contentId;
    }

})();