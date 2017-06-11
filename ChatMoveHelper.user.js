// ==UserScript==
// @name         Chat Move Tool
// @namespace    https://stackexchange.com/users/305991/jason-c
// @version      1.0-dev3
// @description  Makes archiving bot messsages in chat a little easier.
// @author       Jason C
// @include      /^https?:\/\/chat\.meta\.stackexchange\.com\/rooms\/[0-9]+.*$/
// @include      /^https?:\/\/chat\.stackexchange\.com\/rooms\/[0-9]+.*$/
// @include      /^https?:\/\/chat\.stackoverflow\.com\/rooms\/[0-9]+.*$/
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_listValues
// @grant        GM_deleteValue
// @grant        unsafeWindow
// ==/UserScript==

(function() {
    'use strict';

    if (!CHAT.RoomUsers.current().is_owner)
        return;

    var options = loadOptions();

    unsafeWindow.ChatMoveTool = {
        dumpSettings: dump,
        forgetSettings: reset
    };

    buildUI();

    // Set up all the UI stuff.
    function buildUI () {

        // Way easier than typing .css() all over the place.
        $('<style type="text/css"/>').append(`
            .message-controls { width: 400px !important; }
            .message-controls > div { display: flex; align-items: flex-end; }
            .mm-control-pane { flex-basis: 100%; }
            .mm-control-pane:first-child { border-right: 1px dotted #cfcfcf; padding-right: 1ex; }
            .mm-control-pane:last-child { padding-left: 1ex; }
            .mm-control-pane-buttons { display: flex; align-items: center; }
            .mm-control-pane-buttons label { display: inline-flex; align-items: center; flex-grow: 1 }
            .mm-table input[type="text"] { width: 100%; }
            .mm-table label { display: flex; align-items: center; }
            .mm-table input { margin-left: 0; }
            .mm-table td:first-child { padding-right: 1ex; }
            .mm-table td { white-space: nowrap; padding-top: 2px; vertical-align: middle; }
            .message-admin-mode.select-mode.mm-highlight .selected[data-mm-type="message"] { background: rgba(255,0,0,0.6) !important; }
            .message-admin-mode.select-mode.mm-highlight .selected[data-mm-type="command"] { background: rgba(255,80,0,0.6) !important; }
            .message-admin-mode.select-mode.mm-highlight .selected[data-mm-type="reply"] { background: rgba(255,160,0,0.6) !important; }
            .message-admin-mode.select-mode.mm-highlight .message:not(.selected) { opacity: 0.25; }
            .message-admin-mode.select-mode.mm-highlight .mm-contains-none .signature { opacity: 0.25; }
            .message-admin-mode.select-mode.mm-hide-empty .mm-hidden { display: none; }
            .message-admin-mode.select-mode.mm-hide-empty .system-message-container { display: none; }
          `).appendTo('head');

        // Add a bunch of stuff to the move messages dialog.
        let controls = $('.message-controls');
        let btnselect, btnclean;

        let table = $('<table class="mm-table"/>')
            .append($('<tr><td><label><input type="radio" name="mm-opt-usermode" value="name"/>user name:</label></td><td><input id="mm-opt-username" type="text"/></tr>'))
            .append($('<tr><td><label><input type="radio" name="mm-opt-usermode" value="id"/>user id:</label></td><td><input id="mm-opt-userid" type="text"/></tr>'))
            .append($('<tr><td>commands?</td><td><input id="mm-opt-commands" type="checkbox"/></tr>'))
            .append($('<tr><td>cmd prefix:</td><td><input id="mm-opt-prefix" type="text"/></tr>'))
            .append($('<tr><td>replies?</td><td><input id="mm-opt-replies" type="checkbox"/></tr>'));

        let btnmove = $('#adm-move');
        let btncancel = $('#sel-cancel');
        $('<div/>')
            .append($('<div class="mm-control-pane"/>')
                .append(controls[0].childNodes) // Collateral damage: Snags header, too, we'll put it back later.
                .append($('<div class="mm-control-pane-buttons"/>')
                    .append(btnmove)
                    .append(document.createTextNode('\xa0'))
                    .append(btncancel)
                    .append($('<label><input type="checkbox" id="mm-opt-highlight"/>enhance</label>'))))
            .append($('<div class="mm-control-pane"/>')
                .append(table)
                .append($('<div class="mm-control-pane-buttons"/>')
                    .append(btnselect = $('<input type="button" class="button" value="select"/>').click(() => (select(), false)))
                    .append(document.createTextNode('\xa0'))
                    .append($('<input type="button" class="button" value="deselect"/>').click(() => (deselect(), false)))
                    .append($('<span style="flex-grow:1"/>'))
                    .append($('<input type="button" class="button" id="mm-opt-hide" value="hide"/>'))))
            .appendTo(controls);

        // Set up helpful tooltips.
        $('label:has(input[name="mm-opt-usermode"][value="name"]), #mm-opt-username').attr('title', 'match messages by user name (exact, case-sensitive)');
        $('label:has(input[name="mm-opt-usermode"][value="id"]), #mm-opt-userid').attr('title', 'match messages by user chat id');
        $('#mm-opt-commands, #mm-opt-prefix').attr('title', 'match messages that start with the command prefix (case-sensitive)');
        $('#mm-opt-replies').attr('title', 'match messages that are replies to the above user name/id');
        btnselect.attr('title', 'select all messages matching the above filters');
        $('input[type="button"][value="deselect"]', controls).attr('title', 'deselect all selected messages');
        $('#mm-opt-highlight').parent().attr('title', 'color code auto-selected messages, dim unselected messages');
        $('#mm-opt-hide').attr('title', 'hide currently unselected message; unhide then rehide to refresh');

        // Move the header back before mom finds out.
        controls.prepend($('h2', controls));

        // This is our little sidebar shortcut....
        $('#sidebar-menu')
            .append(document.createTextNode(' | '))
            .append(btnclean = $('<a href="#" title="auto select messages then open move dialog">clean</a>'));

        // ... which shows the dialog *and* automatically selects.
        btnclean.click(function () {
            $('#main').addClass('message-admin-mode').addClass('select-mode');
            btnselect.click();
            return false;
        });

        // Set initial values of UI elements.
        $('#mm-opt-highlight').prop('checked', options.settings.highlight);
        $('#mm-opt-username').val(options.filter.username);
        $('#mm-opt-userid').val(options.filter.userid);
        $('#mm-opt-prefix').val(options.filter.commandPrefix);
        $('#mm-opt-commands').prop('checked', options.filter.commands);
        $('#mm-opt-replies').prop('checked', options.filter.replies);
        $(`input[name="mm-opt-usermode"][value="${options.filter.usermode}"]`).click();

        // Any changes to filter elements just update and store local filter, easy. Note
        // the highlight setting is taken care of directly in the HTML above.
        $('.mm-table input').change(function () {
            options.filter.username = $('#mm-opt-username').val().trim();
            options.filter.userid = parseInt($('#mm-opt-userid').val()) || 0;
            options.filter.commandPrefix = $('#mm-opt-prefix').val();
            options.filter.commands = $('#mm-opt-commands').prop('checked');
            options.filter.replies = $('#mm-opt-replies').prop('checked');
            options.filter.usermode = $('input[name="mm-opt-usermode"]:checked').val();
            storeOptions(options);
        });

        // Other misc. callbacks.
        $('#mm-opt-highlight').click(function () { setHighlight($(this).prop('checked')); });
        $('#mm-opt-hide').click(function () { toggleHidden(); });
        $('#mm-opt-username').keypress(function () { $('input[name="mm-opt-usermode"][value="name"]').click(); });
        $('#mm-opt-userid').keypress(function () { $('input[name="mm-opt-usermode"][value="id"]').click(); });

        // Initialize mm-highlight class presence based on initial option value.
        setHighlight(options.settings.highlight);

        // Dim the signatures when "enhance" is selected. See comments.
        setUpSignatureDimming();

    }

    // Select all messages that match the current filter.
    function select () {

        deselect();

        let messages;
        if (options.filter.usermode === 'name') {
            messages = $('.user-container .username')
                .filter(function () { return $(this).text().trim() === options.filter.username; })
                .closest('.user-container')
                .find('.message');
        } else if (options.filter.usermode === 'id') {
            messages = $(`.user-container.user-${options.filter.userid} .message`);
        } else {
            console.log(`Chat Move Tool: Invalid filter.usermode "${options.filter.usermode}"?`);
            messages = $();
        }

        messages.attr('data-mm-type', 'message').addClass('selected');

        if (options.filter.replies) {
            messages.each(function (_, message) {
                let id = parseInt($(message).attr('id').replace(/[^0-9]+/g, ''));
                $(`.message.pid-${id}`).attr('data-mm-type', 'reply').addClass('selected');
            });
        }

        if (options.filter.commands && options.filter.commandPrefix !== '') {
            $('.message')
                .filter(function () { return $(this).text().trim().startsWith(options.filter.commandPrefix); })
                .attr('data-mm-type', 'command')
                .addClass('selected');
        }

    }

    // Deselect *all* selected messages.
    function deselect () {

        $('.message').removeAttr('data-mm-type');
        $('.selected').removeClass('selected');

    }

    // I really want to dim the signatures when "enhance" is selected. It's a nice
    // effect. But CSS doesn't have parent selectors and :has isn't supported, so
    // sadly ".user-container:not(:has(.selected)) .signature" won't work in a style
    // sheet, which would be perfect. So for now, as a workaround, monitor attribute
    // changes and update opacity values manually. Meh. Shit load of work for such
    // a tiny feature though...
    function setUpSignatureDimming () {

        new MutationObserver((ms) => ms.forEach(function (m) {
            if (m.target.classList.contains('message')) {
                let wasSelected = (m.oldValue && m.oldValue.includes('selected')) ? true : false;
                let isSelected = m.target.classList.contains('selected');
                if (wasSelected !== isSelected) {
                    let t = $(m.target);
                    t.closest('.user-container:not(:has(.selected))').addClass('mm-contains-none');
                    t.closest('.user-container:has(.selected)').removeClass('mm-contains-none');
                }
            } else if (m.target.getAttribute('id') === 'main') {
                let wasSelecting = (m.oldValue && m.oldValue.includes('select-mode')) ? true : false;
                let isSelecting = m.target.classList.contains('select-mode');
                if (wasSelecting !== isSelecting) {
                    if (isSelecting) {
                        $('.user-container:not(:has(.selected))').addClass('mm-contains-none');
                        $('.user-container:has(.selected)').removeClass('mm-contains-none');
                    } else {
                        $('.user-container').removeClass('mm-contains-none');
                        toggleHidden(false); // Well... might as well do this here, too.
                    }
                }
            }
        })).observe(document.getElementById('main'), {
            attributes: true,
            attributeOldValue: true,
            attributeFilter: ['class'],
            subtree: true
        });

    }

    // Set or toggle message hiding mode. If hide (boolean) not specified, just toggle.
    function toggleHidden (hide) {

        if (hide === undefined)
            hide = !$('#main').hasClass('mm-hide-empty');

        if (hide) {
            $('#main').addClass('mm-hide-empty');
            $('.user-container.mm-contains-none').addClass('mm-hidden');
            $('.user-container:not(.mm-contains-none').removeClass('mm-hidden');
            $('#mm-opt-hide').attr('value', 'unhide');
        } else {
            $('#main').removeClass('mm-hide-empty');
            $('.mm-hidden').removeClass('mm-hidden');
            $('#mm-opt-hide').attr('value', 'hide');
        }

    }

    // Set highlight mode (and save options).
    function setHighlight (value) {

        options.settings.highlight = value;
        storeOptions(options);

        if (value)
            $('#main').addClass('mm-highlight');
        else
            $('#main').removeClass('mm-highlight');

    }

    // Load options. Returns { filter, settings }.
    function loadOptions () {

        return {

            // Saved filter is per-room.
            filter: $.extend({
                commandPrefix: '!!/',
                username: 'SmokeDetector',
                userid: 266345,
                usermode: 'id',
                commands: true,
                replies: true
            }, load(`filter-${window.location.hostname}-${CHAT.CURRENT_ROOM_ID}`, {})),

            // Other settings are global.
            settings: $.extend({
                highlight: true
            }, load('settings', {}))

        };

    }

    // Save options.
    function storeOptions (options) {

        store(`filter-${window.location.hostname}-${CHAT.CURRENT_ROOM_ID}`, options.filter || {});
        store('settings', options.settings || {});

    }

    // Helper for GM_getValue with support for objects.
    function load (key, def) {

        var obj = null;
        try {
            obj = JSON.parse(GM_getValue(key, null));
        } catch (e) {
            console.error(e);
        }
        return (obj === null) ? def : obj;

    }

    // Helper for GM_setValue. Stores objects. Do not store primitive types.
    function store (key, obj) {

        try {
            GM_setValue(key, JSON.stringify(obj));
        } catch (e) {
            console.error(e);
        }

    }

    // Print all stored settings to console.
    function dump () {

        for (let key of GM_listValues())
            console.log(`${key} => ${GM_getValue(key)}`);

    }

    // Erase all stored settings.
    function reset () {

        for (let key of GM_listValues()) {
            GM_deleteValue(key);
            console.log(`Removed ${key}...`);
        }

    }

})();
