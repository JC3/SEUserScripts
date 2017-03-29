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

    // From http://stackoverflow.com/a/11077016 (thanks!):
    function insertAtCursor(myField, myValue) {
        //IE support
        if (document.selection) {
            myField.focus();
            sel = document.selection.createRange();
            sel.text = myValue;
        }
        //MOZILLA and others
        else if (myField.selectionStart || myField.selectionStart == '0') {
            var startPos = myField.selectionStart;
            var endPos = myField.selectionEnd;
            myField.value = myField.value.substring(0, startPos) + myValue + myField.value.substring(endPos, myField.value.length);
            myField.selectionStart = startPos + myValue.length;
            myField.selectionEnd = startPos + myValue.length;
        } else {
            myField.value += myValue;
        }
    }

    function insertContent (content) {
        var input = document.getElementById('input');
        insertAtCursor(input, content);
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

    // use fromCharCode instead of actual chars because there seems to be encoding
    // issues when transferring from github to tampermonkey.
    createButton('ndash', String.fromCharCode(8211));
    createButton('mdash', String.fromCharCode(8212));
    createButton('rarr', String.fromCharCode(8594));

})();
