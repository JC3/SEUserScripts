// ==UserScript==
// @name         Special characters in chat
// @namespace    http://stackexchange.com/users/305991
// @version      1
// @description  Add buttons for special characters to chat
// @author       Jason C
// @match        *://chat.meta.stackexchange.com/rooms/*
// @match        *://chat.stackexchange.com/rooms/*
// @match        *://chat.stackoverflow.com/rooms/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    function insertContent (content) {
        var input = document.getElementById('input');
        input.value += content;
        input.focus();
    }

    function createButton (label, content) {
        var buttons = document.getElementById('chat-buttons');
        var button = document.createElement('button');
        //button.textContent = label;
        button.textContent = content; // I kind of like this as the label more.
        button.setAttribute('class', 'button');
        button.onclick = function () { insertContent(content); };
        buttons.appendChild(button);
        buttons.appendChild(document.createTextNode(" "));
    }

    createButton('ndash', '–');
    createButton('mdash', '—');
    createButton('rarr', '?');

})();
