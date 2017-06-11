// ==UserScript==
// @name         Chat Move Tool
// @namespace    https://stackexchange.com/users/305991/jason-c
// @version      1.02
// @description  Makes archiving bot messsages in chat a little easier.
// @author       Jason C
// @include      /^https?:\/\/chat\.meta\.stackexchange\.com\/rooms\/[0-9]+.*$/
// @include      /^https?:\/\/chat\.stackexchange\.com\/rooms\/[0-9]+.*$/
// @include      /^https?:\/\/chat\.stackoverflow\.com\/rooms\/[0-9]+.*$/
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_listValues
// @grant        GM_deleteValue
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // Firefox support: Store working copy of settings in fakedb.
    var fakedb = {settings: {}, scriptVersion: GM_info.script.version};
    for (let key of GM_listValues())
        fakedb.settings[key] = GM_getValue(key);

    // Firefox support: Use events for settings instead of GM_* directly.
    window.addEventListener('setvalue-8ec2f538-b698-4471-b38d-e8b61be84e87', function (ev) {
        if (typeof ev.detail.key !== 'string' || typeof ev.detail.value !== 'string')
            return;
        GM_setValue(ev.detail.key, ev.detail.value);
    });

    // Firefox support: Use events for settings instead of GM_* directly.
    window.addEventListener('deletevalue-8ec2f538-b698-4471-b38d-e8b61be84e87', function (ev) {
        if (typeof ev.detail.key !== 'string')
            return;
        GM_deleteValue(ev.detail.key);
    });

    // Firefox support: Inject the script directly into the page. Note run-at document-idle
    // is required to ensure CHAT and stuff is available.
    (function (fn, db) {
        let script = document.createElement('script');
        script.type = 'text/javascript';
        script.textContent = `(${fn.toString()})(window.jQuery, ${JSON.stringify(db)})`;
        document.body.appendChild(script);
    })(MakeChatMoveTool, fakedb);

function MakeChatMoveTool ($, fakedb) {

    if (!CHAT.RoomUsers.current().is_owner)
        return;

    const UPDATE_URL = 'https://stackapps.com/q/7439/25350';

    var options = loadOptions();

    window.ChatMoveTool = {
        dumpSettings: dump,
        forgetSettings: reset
    };

    buildUI();

    // Set up all the UI stuff.
    function buildUI () {

        // Way easier than typing .css() all over the place.
        $('<style type="text/css"/>').append(`
            .message-controls { width: 400px !important; background: white !important; left: auto !important; right: 5% !important; }
            .message-controls > div { display: flex; }
            .message-controls input:not([type="button"]) { border: 1px solid #cbcbcb; color: #3b4045; }
            .message-controls .button.disabled, .message-controls .button.disabled:hover { cursor: default !important; background: #aaa !important; }
            .mm-version { float: right; opacity: 0.8; font-size: 95%; }
            .mm-control-pane { flex-basis: 100%; }
            .mm-control-pane:first-child { border-right: 1px dotted #cfcfcf; padding-right: 1ex; }
            .mm-control-pane:last-child { padding-left: 1ex; }
            .mm-control-pane-buttons { display: flex; align-items: center; }
            .mm-control-pane-buttons label { display: inline-flex; align-items: center; flex-grow: 1 }
            .mm-flex-spacer { flex-grow: 1; }
            .mm-table input[type="text"] { width: calc(100% - 2px); box-shadow: inset 0 1px 2px #eff0f1, 0 0 0 #FFF; }
            .mm-table input[type="radio"] { margin-left: 1px; }
            .mm-table input { margin-left: 0; }
            .mm-table label { display: flex; align-items: center; }
            .mm-table td:first-child { padding-right: 1ex; }
            .mm-table td { white-space: nowrap; vertical-align: middle; }
            .mm-table tr:not(:first-child) td { padding-top: 2px; }
            .message-admin-mode.select-mode.mm-highlight .selected[data-mm-type="message"], .mm-highlight .mm-label-message { background: rgba(255,0,0,0.4) !important; }
            .message-admin-mode.select-mode.mm-highlight .selected[data-mm-type="command"], .mm-highlight .mm-label-command { background: rgba(255,80,0,0.4) !important; }
            .message-admin-mode.select-mode.mm-highlight .selected[data-mm-type="reply"], .mm-highlight .mm-label-reply { background: rgba(255,160,0,0.4) !important; }
            .message-admin-mode.select-mode.mm-highlight .message:not(.selected) { opacity: 0.25; }
            .message-admin-mode.select-mode.mm-highlight .mm-contains-none .signature { opacity: 0.25; }
            .message-admin-mode.select-mode.mm-hide-empty .mm-hidden { display: none; }
            .message-admin-mode.select-mode.mm-hide-empty .system-message-container { display: none; }
          `).appendTo('head');

        // Add a bunch of stuff to the move messages dialog.
        let controls = $('.message-controls');
        let btnselect, btnclean, btnautohide;

        let table = $('<table class="mm-table"/>')
            .append($('<tr class="mm-label-message"><td><label><input type="radio" name="mm-opt-usermode" value="name"/>user name:</label></td><td><input id="mm-opt-username" type="text"/></tr>'))
            .append($('<tr class="mm-label-message"><td><label><input type="radio" name="mm-opt-usermode" value="id"/>user id:</label></td><td><input id="mm-opt-userid" type="text"/></tr>'))
            .append($('<tr class="mm-label-command"><td>commands?</td><td><input id="mm-opt-commands" type="checkbox"/></tr>'))
            .append($('<tr class="mm-label-command"><td>cmd prefix:</td><td><input id="mm-opt-prefix" type="text"/></tr>'))
            .append($('<tr class="mm-label-reply"><td>replies?</td><td><input id="mm-opt-replies" type="checkbox"/></tr>'));

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
            .append($('<div class="mm-control-pane" style="display:flex;flex-direction:column;"/>')
                .append(table)
                .append($('<div class="mm-flex-spacer"/>'))
                .append($('<div class="mm-control-pane-buttons"/>')
                    .append(btnselect = $('<input type="button" class="button" value="select"/>').click(() => (select(), false)))
                    .append(document.createTextNode('\xa0'))
                    .append($('<input type="button" class="button" value="deselect" id="mm-button-deselect"/>').click(() => (deselect(), false)))
                    .append($('<span class="mm-flex-spacer"/>'))
                    .append($('<input type="button" class="button" id="mm-opt-hide" value="hide"/>'))
                    .append(btnautohide = $('<label><input type="checkbox" id="mm-opt-autohide">auto</label>'))))
            .appendTo(controls);

        // Cram it in there.
        btnautohide.css({
            'position': 'absolute',
            'bottom': 36,
            'right': btnautohide.width() + 10
        });

        // Set up helpful tooltips.
        $('label:has(input[name="mm-opt-usermode"][value="name"]), #mm-opt-username').attr('title', 'match messages by user name (exact, case-sensitive)');
        $('label:has(input[name="mm-opt-usermode"][value="id"]), #mm-opt-userid').attr('title', 'match messages by user chat id');
        $('#mm-opt-commands, #mm-opt-prefix').attr('title', 'match messages that start with the command prefix (case-sensitive)');
        $('#mm-opt-replies').attr('title', 'match messages that are replies to the above user name/id');
        btnselect.attr('title', 'select all messages matching the above filters');
        $('input[type="button"][value="deselect"]', controls).attr('title', 'deselect all selected messages');
        $('#mm-opt-highlight').parent().attr('title', 'color code auto-selected messages, dim unselected messages');
        $('#mm-opt-hide').parent().attr('title', 'hide currently unselected message; unhide then rehide to refresh');
        btnautohide.attr('title', 'select this to initially hide when \'clean\' is clicked');

        // Move the header back before mom finds out.
        controls.prepend($('h2', controls));

        // Version number.
        $('<div class="mm-version"/>')
            .append($('<a/>').attr('href', UPDATE_URL).text(`Chat Move Tool ${fakedb.scriptVersion}`))
            .prependTo(controls);

        // This is our little sidebar shortcut....
        $('#sidebar-menu')
            .append(document.createTextNode(' | '))
            .append(btnclean = $('<a href="#" title="auto select messages then open move dialog">clean</a>'));

        // ... which shows the dialog *and* automatically selects (and maybe hides).
        btnclean.click(function () {
            $('#main').addClass('message-admin-mode').addClass('select-mode');
            btnselect.click();
            // Hack alert; hiding requires the classes set by the DOM observer, but that takes
            // a while to complete after btnselect.click() is called. Easy solution for now
            // is to just wait a little bit. Increase this delay if needed.
            window.setTimeout(function () { toggleHidden(options.settings.autohide); }, 250);
            return false;
        });

        // Set initial values of UI elements.
        $('#mm-opt-highlight').prop('checked', options.settings.highlight);
        $('#mm-opt-autohide').prop('checked', options.settings.autohide);
        $('#mm-opt-username').val(options.filter.username);
        $('#mm-opt-userid').val(options.filter.userid);
        $('#mm-opt-prefix').val(options.filter.commandPrefix);
        $('#mm-opt-commands').prop('checked', options.filter.commands);
        $('#mm-opt-replies').prop('checked', options.filter.replies);
        $(`input[name="mm-opt-usermode"][value="${options.filter.usermode}"]`).click();

        // Any changes to filter elements just update and store local filter, easy. Note
        // the global settings are taken care of in the click handlers below.
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
        $('#mm-opt-autohide').click(function () { setAutoHide($(this).prop('checked')); });
        $('#mm-opt-hide').click(function () { toggleHidden(); });
        $('#mm-opt-username').keypress(function () { $('input[name="mm-opt-usermode"][value="name"]').click(); });
        $('#mm-opt-userid').keypress(function () { $('input[name="mm-opt-usermode"][value="id"]').click(); });

        // Initialize mm-highlight class presence based on initial option value.
        setHighlight(options.settings.highlight);

        // Dim the signatures when "enhance" is selected. See comments.
        setUpSignatureDimming();

    }

    // Update the selection count displayed on the UI. There's a couple solutions
    // here, including just doing this on a timer. For now I've gone with the most
    // responsive, it doesn't seem to be causing performance issues, which is to
    // just do it in the mutation observer when we enter selection mode, or when
    // the selection changes (kind of defeats the purpose of my previous performance
    // optimizations there but whatever).
    function updateSelectedCount () {

        if (document.getElementById('main').classList.contains('select-mode')) {
            let count = document
                .getElementById('chat')
                .getElementsByClassName('selected')
                .length;
            if (count !== updateSelectedCount.previous) {
                let button = $('#mm-button-deselect')
                .val(count ? `deselect ${count}` : 'deselect')
                .prop('disabled', !count);
                if (count)
                    button.removeClass('disabled');
                else
                    button.addClass('disabled');
                updateSelectedCount.previous = count;
            }
        }

    }

    // Select all messages that match the current filter.
    function select () {

        deselect();

        let messages;
        if (options.filter.usermode === 'name') {
            messages = $('#chat .user-container .username')
                .filter(function () { return $(this).text().trim() === options.filter.username; })
                .closest('.user-container')
                .find('.message');
        } else if (options.filter.usermode === 'id') {
            messages = $(`#chat .user-container.user-${options.filter.userid} .message`);
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
                    t.closest('.user-container:has(.selected)').removeClass('mm-contains-none').removeClass('mm-hidden');
                    // mm-hidden is also removed above as a convenience, it makes sense
                    // if you're in hidden mode but press the 'select' button to reveal
                    // newly selected messages.
                    updateSelectedCount(); // <-- Ugh performance, whatever.
                }
            } else if (m.target.getAttribute('id') === 'main') {
                let wasSelecting = (m.oldValue && m.oldValue.includes('select-mode')) ? true : false;
                let isSelecting = m.target.classList.contains('select-mode');
                if (wasSelecting !== isSelecting) {
                    if (isSelecting) {
                        $('#chat .user-container:not(:has(.selected))').addClass('mm-contains-none');
                        $('#chat .user-container:has(.selected)').removeClass('mm-contains-none');
                        updateSelectedCount(); // To update when dialog opened from room menu rather than 'clean'.
                    } else {
                        $('#chat .user-container').removeClass('mm-contains-none');
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
            $('#chat .user-container.mm-contains-none').addClass('mm-hidden');
            $('#chat .user-container:not(.mm-contains-none').removeClass('mm-hidden');
            $('#mm-opt-hide').attr('value', 'unhide');
            // Firefox does not scroll automatically.
            if (!window.chrome)
                $(document).scrollTop($(document).height());
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

    // Set auto hide mode (and save options).
    function setAutoHide (value) {

        options.settings.autohide = value;
        storeOptions(options);

    }

    // Load options. Returns { filter, settings }.
    function loadOptions () {

        let SMOKEY_ID = 0;
        if (window.location.hostname === 'chat.meta.stackexchange.com')
            SMOKEY_ID = 266345;
        else if (window.location.hostname === 'chat.stackexchange.com')
            SMOKEY_ID = 120914;
        else if (window.location.hostname === 'chat.stackoverflow.com')
            SMOKEY_ID = 3735529;

        return {

            // Saved filter is per-room.
            filter: $.extend({
                commandPrefix: '!!/',
                username: 'SmokeDetector',
                userid: SMOKEY_ID,
                usermode: (SMOKEY_ID ? 'id' : 'name'),
                commands: true,
                replies: true
            }, load(`filter-${window.location.hostname}-${CHAT.CURRENT_ROOM_ID}`, {})),

            // Other settings are global.
            settings: $.extend({
                highlight: true,
                autohide: false
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
            if (typeof fakedb.settings[key] !== 'undefined')
                obj = JSON.parse(fakedb.settings[key]);
        } catch (e) {
            console.error(e);
        }
        return (obj === null) ? def : obj;

    }

    // Helper for GM_setValue. Stores objects. Do not store primitive types.
    function store (key, obj) {

        try {
            let val = JSON.stringify(obj);
            fakedb.settings[key] = val;
            window.dispatchEvent(new CustomEvent('setvalue-8ec2f538-b698-4471-b38d-e8b61be84e87', {detail: {key: key, value: val}}));
        } catch (e) {
            console.error(e);
        }

    }

    // Print all stored settings to console.
    function dump () {

        for (let key of Object.keys(fakedb.settings).sort())
            console.log(`${key} => ${JSON.stringify(load(key))}`);

    }

    // Erase all stored settings.
    function reset (noreload) {

        for (let key of Object.keys(fakedb.settings)) {
            window.dispatchEvent(new CustomEvent('deletevalue-8ec2f538-b698-4471-b38d-e8b61be84e87', {detail: {key: key}}));
            delete fakedb.settings[key];
            console.log(`Removed ${key}...`);
        }

        if (!noreload)
            document.location.reload();

    }

}

})();
