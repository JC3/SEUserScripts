// ==UserScript==
// @name         RO Delete Messages
// @namespace    https://stackexchange.com/users/305991/jason-c
// @version      1.01
// @description  Message delete button for room owners.
// @author       Jason C
// @include      /^https?:\/\/chat\.meta\.stackexchange\.com\/rooms\/[0-9]+.*$/
// @include      /^https?:\/\/chat\.stackexchange\.com\/rooms\/[0-9]+.*$/
// @include      /^https?:\/\/chat\.stackoverflow\.com\/rooms\/[0-9]+.*$/
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // Non-ROs can't use this. Mods already have delete.
    if (!CHAT.RoomUsers.current().is_owner || CHAT.RoomUsers.current().is_moderator)
        return;

    new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach(function (a) {
        if (a.classList) {
            if (a.classList.contains('message'))
                a.setAttribute('data-rodel-timestamp', Date.now());
            else if (a.classList.contains('popup') && a.parentNode &&
                     a.parentNode.classList && a.parentNode.classList.contains('message'))
                modifyPopup($(a));
        }
    }))).observe(document.getElementById('chat'), {
        childList: true,
        subtree: true
    });

    function modifyPopup (popup) {

        let message = popup.closest('.message');
        let timestamp = message.data('rodel-timestamp');

        // 2 minute time limit.
        if (!timestamp || (Date.now() - timestamp > 2 * 60 * 60 * 1000))
            return;

        // Don't add option if message already deleted.
        if ($('.deleted', message).length > 0)
            return;

        // Don't add option for our own messages.
        let userid = parseInt($('a.signature', message.closest('.user-container'))
                              .attr('href').replace(/[^0-9]+/g, ''));
        if (userid === CHAT.CURRENT_USER_ID || !userid)
            return;

        // We'll need the message ID for the actual request.
        let messageid = parseInt(message.attr('id').replace(/[^0-9]+/g, ''));
        if (!messageid)
            return;

        // And finally...
        popup
            .append(document.createTextNode(' | '))
            .append($('<a href="#">delete</a>').click(function () {
                deleteMessage(messageid);
                popup.remove();
                return false;
            }));

    }

    function deleteMessage (messageid) {

        if (!window.confirm(`Really delete this message (#${messageid})?`))
            return;

        $.post(`/messages/${messageid}/delete`, { fkey: $('#fkey').val() }).then(function () {
            console.log(`RO Delete: Deleted message ${messageid}.`);
        }).fail(function (e) {
            console.log(`RO Delete: Failed to delete message ${messageid}.`);
            console.error(e);
        });

    }

})();
