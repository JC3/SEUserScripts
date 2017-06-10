// ==UserScript==
// @name         Move SmokeDetector Messages
// @namespace    https://stackexchange.com/users/305991/jason-c
// @version      0.1
// @description  Tool for moving SmokeDetector messges from the tavern.
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

    const FILTER_KEY = `${window.location.hostname}-${CHAT.CURRENT_ROOM_ID}-filter`;

    let filter = $.extend({
        commandPrefix: '!!/',
        username: 'SmokeDetector',
        userid: 266345,
        usermode: 'id',
        commands: true,
        replies: true
    }, load(FILTER_KEY, {}));

    let options = $.extend({
        highlight: true
    }, load('options', {}));

    let ui = buildUI();

    setHighlight(options.highlight);

    // Create GUI. This adds stuff to move dialog and also a shortcut next to room menu.
    function buildUI () {

        let gui = {};

        $('<style type="text/css"/>').append(`
            .message-controls { width: 400px !important; }
            .message-controls > div { display: flex; align-items: flex-end; }
            .mm-control-pane { flex-basis: 100%; }
            .mm-control-pane-buttons { display: flex; align-items: center; }
            .mm-control-pane-buttons label { display: inline-flex; align-items: center; flex-grow: 1 }
            .mm-table input[type="text"] { width: 100%; }
            .mm-table label { display: flex; align-items: center; }
            .mm-table input { margin-left: 0; }
            .mm-table td:first-child { padding-right: 1ex; }
            .mm-table td { white-space: nowrap; padding-top: 2px; vertical-align: middle; }
          `).appendTo('head');

        gui.highlightStyles = $('<style type="text/css"/>').append(`
            .mm-command { background: #f80 !important; }
            .mm-smoke { background: #f00 !important; }
            .mm-reply { background: #ff0 !important; }
            .mm-none:not(.selected) { opacity: 0.25; }
           `).appendTo('head');

        let controls = $('.message-controls');

        let table = $('<table class="mm-table"/>')
            .append($('<tr><td><label><input type="radio" name="mm-opt-usermode" value="name"/>user name:</label></td><td><input id="mm-opt-username" type="text"/></tr>'))
            .append($('<tr><td><label><input type="radio" name="mm-opt-usermode" value="id"/>user id:</label></td><td><input id="mm-opt-userid" type="text"/></tr>'))
            .append($('<tr><td>commands?</td><td><input id="mm-opt-commands" type="checkbox"/></tr>'))
            .append($('<tr><td>cmd prefix:</td><td><input id="mm-opt-prefix" type="text"/></tr>'))
            .append($('<tr><td>replies?</td><td><input id="mm-opt-replies" type="checkbox"/></tr>'));

        $('<div/>')
            .append($('<div class="mm-control-pane"/>')
                .css({'border-right': '1px dotted #cfcfcf', 'padding-right': '1ex'})
                .append(controls[0].childNodes)) // Snags header, too, we'll put it back later.
            .append($('<div class="mm-control-pane"/>')
                .css({'padding-left': '1ex'})
                .append(table)
                .append($('<div class="mm-control-pane-buttons"/>')
                    .append($('<input type="button" class="button" value="select"/>').click(()=>(selectSmoke(),false)))
                    .append(document.createTextNode('\xa0'))
                    .append($('<input type="button" class="button" value="deselect"/>').click(()=>(deselectSmoke(),false)))
                    .append($('<label><input type="checkbox" id="mm-opt-highlight"/>enhance</label>'))))
            .appendTo(controls);

        controls.prepend($('h2', controls)); // Move the header back.

        $('#sidebar-menu')
            .append(document.createTextNode(' | '))
            .append($('<a href="#" title="auto select messages then open move dialog">clean</a>').click(()=>(openMove().then(selectSmoke),false)));

        $('#mm-opt-highlight').click(function () {
            setHighlight($(this).prop('checked'));
        }).prop('checked', options.highlight);

        $('#mm-opt-username').val(filter.username);
        $('#mm-opt-userid').val(filter.userid);
        $('#mm-opt-prefix').val(filter.commandPrefix);
        $('#mm-opt-commands').prop('checked', filter.commands);
        $('#mm-opt-replies').prop('checked', filter.replies);
        $(`input[name="mm-opt-usermode"][value="${filter.usermode}"]`).click();

        $('#sel-cancel').click(function () {
            deselectSmoke();
            return true;
        });

        $('#adm-move').click(function () {
            let tid = $(this).data('mm-timer-id');
            if (!tid) {
                tid = window.setInterval(function () {
                    if ($('#main.select-mode, .message.selected').length === 0) {
                        window.clearInterval(tid);
                        $('#adm-move').data('mm-timer-id', null);
                        deselectSmoke();
                        console.log('derp');
                    }
                }, 250);
                $('#adm-move').data('mm-timer-id', tid);
            }
        });

        return gui;

    }

    // Open the move dialog. Returns a deferred function.
    function openMove () {

        // Easiest way is to click link in room menu, but room menu popup is created
        // and destroyed on the fly, so we have to wait for it.
        return $.Deferred(function (def) {
            let m = $('.room-popup a:contains("move messages")');
            if (m.length !== 0) {
                // Popup is already loade so just open the dialog.
                m.click();
                def.resolve();
            } else {
                // Click room menu to start the popup loading.
                if ($('.room-popup').length === 0)
                    $('#room-menu').click();
                // Now wait for the move messages link to appear and click it.
                let i = window.setInterval(function () {
                    let m = $('.room-popup a:contains("move messages")');
                    if (m.length !== 0) {
                        window.clearInterval(i);
                        m.click();
                        def.resolve();
                    }
                }, 50);
            }
        });

    }

    function selectSmoke () {

        deselectSmoke();

        filter.username = $('#mm-opt-username').val().trim();
        filter.userid = parseInt($('#mm-opt-userid').val());
        filter.commandPrefix = $('#mm-opt-prefix').val();
        filter.commands = $('#mm-opt-commands').prop('checked');
        filter.replies = $('#mm-opt-replies').prop('checked');
        filter.usermode = $('input[name="mm-opt-usermode"]:checked').val();
        store(FILTER_KEY, filter);

        let smoke = {};

        $('.message').each(function (_, message) {
            try {
                let info = getMessageInfo($(message), filter);
                if (info.type) {
                    smoke[info.messageid] = info;
                    if (filter.replies && info.type === 'smoke') {
                        $(`.pid-${info.messageid}`).each(function (_, reply) {
                            let rinfo = getMessageInfo($(reply));
                            if (!smoke[rinfo.messageid])
                                smoke[rinfo.messageid] = $.extend(rinfo, {type:'reply'});
                        });
                    }
                }
            } catch (e) {
                console.error(e);
            }
        });

        for (let messageid in smoke) {
            let info = smoke[messageid];
            info.element
                .addClass(`mm-${info.type}`)
                .addClass('mm-selected')
                .addClass('selected');
        }

        $('.message:not(.mm-selected)').addClass('mm-none');
        $('.user-container:not(:has(.mm-selected)) .signature').addClass('mm-none');

    }

    function deselectSmoke () {

        $('.mm-selected')
            .removeClass('selected')
            .removeClass('mm-selected');

        $('.message, .signature')
            .removeClass('mm-command')
            .removeClass('mm-smoke')
            .removeClass('mm-reply')
            .removeClass('mm-none');

    }

    // Get info about a message.
    //   message: jQuery wrapper for a .message element.
    //   filter: Optional filter descriptor.
    // Returns {
    //   element: The message element.
    //   username: The user name.
    //   userid: The user id.
    //   messageid: The message id.
    //   content: The message text.
    //   type: If filter specified, see getMessageType(). Otherwise not present.
    // }
    function getMessageInfo (message, filter) {

        let container = message.closest('.user-container');
        let info = {
            element: message,
            username: $('.username:first', container).text().trim(),
            userid: parseInt($('a.signature', container).attr('href').replace(/[^0-9]+/g, '')),
            messageid: parseInt(message.attr('id').replace(/[^0-9]+/g, '')),
            content: $('.content', message).text().trim()
        };
        info.type = filter && getMessageType(info, filter);
        return info;

    }

    // Determine message type based on filter. 'info' is from getMessageInfo().
    // 'filter' is the filter. Returns 'command', 'smoke', or ''. We don't determine
    // if the type is 'reply' here, that's a later step since it requires context
    // that is unavailable at this point.
    function getMessageType (info, filter) {

        if ((filter.usermode === 'id' && info.userid === filter.userid) ||
            (filter.usermode === 'name' && info.username === filter.username))
            return 'smoke';
        else if (filter.commands && info.content.startsWith(filter.commandPrefix))
            return 'command';
        else
            return '';

    }

    function setHighlight (enable) {

        if (enable)
            ui.highlightStyles.appendTo('head');
        else
            ui.highlightStyles = ui.highlightStyles.detach();

        options.highlight = enable;
        store('options', options);

    }

    function store (key, obj) {

        try {
            GM_setValue(key, JSON.stringify(obj));
        } catch (e) {
            console.error(e);
        }

    }

    function load (key, def) {

        var obj = null;
        try {
            obj = JSON.parse(GM_getValue(key, null));
        } catch (e) {
            console.error(e);
        }
        return (obj === null) ? def : obj;

    }

    unsafeWindow.AutoMove = { };

    unsafeWindow.AutoMove.dumpOptions = function () {
        for (let key of GM_listValues().sort())
            console.log(`${key} => ${GM_getValue(key)}`);
    };

    unsafeWindow.AutoMove.resetOptions = function () {
        for (let key of GM_listValues())
            GM_deleteValue(key);
    };

    unsafeWindow.AutoMove.currentFilter = () => filter;

})();
