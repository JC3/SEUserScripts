// ==UserScript==
// @name         Multi Chat
// @namespace    http://stackexchange.com/users/305991/jason-c
// @version      0.03-alpha
// @description  Multiple chat rooms in one window.
// @author       Jason C
// @include      /^https?:\/\/chat.stackoverflow.com\/(multichat)?(\?.*)?$/
// @include      /^https?:\/\/chat.stackexchange.com\/(multichat)?(\?.*)?$/
// @include      /^https?:\/\/chat.meta.stackexchange.com\/(multichat)?(\?.*)?$/
// @grant        unsafeWindow
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// ==/UserScript==

(function() {
    'use strict';

    // TODO:
    // - monitor and transform chat room links
    // - monitor div.notification pop-ups and if "you have been mentioned in a room
    //     you aren't currently in" appears for a room open in another dialog, remove it.
    // - window arrangement.

    // Add a topbar link on the main chat page. Convenient because since /multichat gets
    // a 404 from SE's servers, some browser don't remember it in the history and so the
    // autocomplete doesn't work in the address bar. This makes multichat slightly more
    // convenient to access.
    if (!window.location.pathname.startsWith('/multichat')) {
        $('<a/>')
            .attr('href', `https://${window.location.hostname}/multichat`)
            .attr('title', 'multichat')
            .text('multichat')
            .prependTo('.topbar-menu-links');
        return;
    }

    var baseTitle;
    switch (window.location.hostname) {
        case 'chat.stackoverflow.com': baseTitle = 'SO Multi Chat'; break;
        case 'chat.stackexchange.com': baseTitle = 'SE Multi Chat'; break;
        case 'chat.meta.stackexchange.com': baseTitle = 'MSE Multi Chat'; break;
    }

    unsafeWindow.MultiChat = {
        openChatRoom: openChatRoom,
        getDialogInfo: getDialogInfo,
        storeDesktopState: storeDesktopState,
        restoreDesktopState: restoreDesktopState,
        load: load,
        store: store,
        dump: dump,
        tileRooms: tileRooms
    };

    preparePage()
        .then(() => console.log('ready'));

    // Set up everything on the page. Returns a promise.
    function preparePage () {

        // First things first, completely gut the 404 page.
        $('body').removeAttr('class').empty();
        $('title').text(baseTitle);
        $('style').remove();
        $('script:not([src*="jquery"])').remove();

        // Can't run without HTTPS (none of the frames work).
        if (!window.location.protocol.startsWith('https')) {
            let https = window.location.href.replace(/^[^:]*/, 'https');
            $('<div\>')
                .append(`Multichat works in HTTPS only. <a href="${https}">Switch now</a> or wait 5 seconds.`)
                .appendTo('body');
            window.setTimeout(function () { window.location = https; }, 5000);
            return $.when();
        }

        // Set up our stylesheet.
        $('<style/>').attr('type', 'text/css')
            .append('\n')
            .append('.multi-dialog, .multi-dialog-content { padding: 0 !important; }\n')
            .append('.multichat iframe { width: 100%; height: 100%; border: 0; margin: 0; padding: 0; }\n')
            .append('.multichat { overflow: visible !important; margin: 4px !important; }\n')
            .appendTo('head');

        return ($('script[src*="jquery-ui"]').length > 0 ? $.when() : $.when(

            // We're going to need jQuery UI.
            $.Deferred(function (def) {
                $('<link/>')
                    .attr('rel', 'stylesheet')
                    .attr('href', '//ajax.googleapis.com/ajax/libs/jqueryui/1.12.1/themes/smoothness/jquery-ui.css')
                    .appendTo('head')
                    .load(def.resolve);
            }),
            $.Deferred(function (def) {
                // jQuery hates adding script tags (https://stackoverflow.com/q/610995)
                let s = document.createElement('script');
                s.src = '//ajax.googleapis.com/ajax/libs/jqueryui/1.12.1/jquery-ui.min.js';
                s.onload = def.resolve;
                document.head.appendChild(s);
            })

        )).then(function () {

            $('body').css({
                'background': 'gray'
            });

            $(unsafeWindow).unload(function () {
                storeDesktopState();
            });

            if (!restoreDesktopState())
                openDefaultRooms();

        }).promise();

    }

    // Pass in a string url, or an object { roomid, position,width,height}
    function openChatRoom (target) {

        let server, roomid;

        if (typeof target === 'string') {
            let urlparser = document.createElement('a');
            urlparser.href = target;
            server = urlparser.hostname;
            roomid = /rooms\/([0-9]+)/.exec(urlparser.pathname);
            roomid = roomid && roomid[1];
        } else if (target && target.roomid) {
            server = window.location.hostname;
            roomid = target.roomid;
        } else {
            console.log('invalid params to openChatRoom');
            return;
        }

        if (server !== window.location.hostname) {
            console.log('invalid server to openChatRoom');
            return;
        }

        if ($(`.multichat[data-roomid="${roomid}"]`).length === 0) {
            let room = $('<div/>')
            .addClass('multichat')
            .attr('data-roomid', roomid)
            .attr('title', `Room #${roomid} (${server})`)
            .appendTo('body');
            room.dialog({
                appendTo: 'body',
                width: target.width || 1000,
                height: target.height || 500,
                position: target.position, // undefined is ok
                show: 100,
                hide: 100,
                autoOpen: false,
                classes: {
                    'ui-dialog': 'multi-dialog',
                    'ui-dialog-content': 'multi-dialog-content',
                    'ui-dialog-buttonpane': '',
                    'ui-dialog-titlebar': '',
                    'ui-dialog-titlebar-close': '',
                    'ui-dialog-title': ''
                }
            });
            let frame = $('<iframe/>')
                .attr('src', `https://${server}/rooms/${roomid}`)
                .appendTo(room);
            frame.load(function () { assimilateRoom(room, $(this).contents().find('html')); });
        } else if (target.width && target.height && target.position) {
            $(`.multichat[data-roomid="${roomid}"]`).dialog('option', {
                width: target.width,
                height: target.height,
                position: target.position
            });
        }

        $(`.multichat[data-roomid="${roomid}"]`).dialog('open');

    }

    function getDialogInfo (multichat) {
        let info = {
            open: multichat.dialog('isOpen'),
            position: multichat.dialog('option', 'position'),
            width: multichat.dialog('option', 'width'),
            height: multichat.dialog('option', 'height'),
            roomid: multichat.data('roomid'),
            zindex: multichat.closest('.ui-dialog').css('z-index')
        };
        // Hack, it changes position.of to an self-referencing object when
        // dialog is moved, which breaks JSON.stringify and thus storeDesktopState().
        if (typeof info.position.of === 'object')
            info.position.of = 'body';
        return info;
    }

    function storeDesktopState () {
        console.log('storing desktop...');
        let desktop = { server: window.location.hostname, windows: [] };
        $('.multichat').each(function (_, win) {
            desktop.windows.push(getDialogInfo($(win)));
        });
        store(`desktop-${window.location.hostname}`, desktop);
    }

    function restoreDesktopState () {
        console.log('restoring desktop...');
        let restored = false;
        let desktop = load(`desktop-${window.location.hostname}`, null);
        if (desktop && desktop.windows) {
            // Order by z-index so they're in the same order on creation.
            for (let win of desktop.windows.sort((a,b) => a.zindex - b.zindex))
                if (win.open) {
                    openChatRoom(win);
                    restored = true;
                }
        }
        return restored;
    }

    function openDefaultRooms () {
        let room = {};
        switch (window.location.hostname) {
            case 'chat.stackoverflow.com': room.roomid = 17; break;
            case 'chat.stackexchange.com': room.roomid = 11540; break;
            case 'chat.meta.stackexchange.com': room.roomid = 89; break;
        }
        openChatRoom(room);
    }

    function tileRooms () {

        let dialogs = $('.multichat');
        let width = $(window).width();
        let height = $(window).height();
        let count = dialogs.length;

        if (!count)
            return;

        for (let n = 0; n < count; ++ n) {
            let dialog = $(dialogs[n]);
            let x = width * n / count;
            let x2 = width * (n + 1) / count;
            let w = x2 - x;
            console.log(`${n} ${x} 0 ${w} ${height}`);
            dialog.dialog('option', {
                width: w,
                height: height
            });
        }

    }

    function assimilateRoom (dlg, doc) {

        let roomName = doc.find('#roomname').text().trim();
        dlg.dialog('option', 'title', roomName);

        // Some global styles for dynamically created elements.
        let buttonFontSize = doc.find('#chat-buttons').css('font-size');
        $('<style/>').attr('type', 'text/css')
            .append('.popup { z-index: 1001; }\n')
            .append('#room-tags { display: none; }\n') // Favorite button keeps recreating them in #info.
            .append(`#chat-buttons .button { margin-left: 1ex; font-size: ${buttonFontSize}; }\n`)
            .append('#chat-buttons .button:last-child { margin-right: 1ex; }\n')
            .append('.notification { z-index: 1002; }\n')
            .appendTo(doc.find('head'));

        // 'attic' is where I'm putting stuff I want to remove but that is necessary for
        // SE's scripts to function properly.
        let attic = $('<div/>')
        .css('display', 'none')
        .attr('id', 'multichat-attic')
        .appendTo(doc.find('body'));
        doc.find('#about-room').appendTo(attic); // Needed when showing room menu.
        doc.find('#roomname').appendTo(attic);   // Needed when showing room menu.
        //doc.find('#room-tags').appendTo(attic);  // Needed by favorite button.

        // Fix up the input area. Get rid of most of the stuff, make it compact. Drop
        // the table and use divs instead, as well.
        let inputLinkColor = doc.find('#footer-legal a:first').css('color');
        let inputArea = doc.find('#input-area');
        $('<div\>')
            .attr('id', 'input-temp')
            .appendTo(inputArea)
            .append(inputArea.find('.input-hint-container'))
            .append($('<div id="reply-spacer"\>').append(inputArea.find('#reply-count')))
            .append($('<div class="chat-input"\>').append(inputArea.find('td.chat-input').children()))
            .append($('<div id="chat-buttons-temp"\>').append(inputArea.find('#chat-buttons').children()));
        inputArea.children(':not(#input-temp)').remove();
        inputArea.append(inputArea.find('#input-temp').children());
        inputArea.find('#input-temp').remove();
        inputArea.find('#chat-buttons-temp').attr('id', 'chat-buttons');

        // Style input area.
        inputArea.children(':not(.input-hint-container)').css({
            'display': 'inline-block',
            'width': 'auto',
            'height': 'auto'
        });
        inputArea.find('.chat-input').css({
            'padding': '2px',
            'padding-right': '0',
            'flex-grow': '1'
        });
        inputArea.find('#input').attr('rows', '2').css({
            'width': '100%',
            'height': 'auto'
        });
        inputArea.find('#bubble').css({
            'width': 'auto',
            'height': `${inputArea.find('#input').height() + 6}px` // + 2 padding + 1 border
        });
        inputArea.find('#chat-buttons').css({
            'white-space': 'nowrap',
            'vertical-align': 'middle',
            'flex-shrink': '0',
            'padding': '2px',
            'font-size': '0'
        });
        inputArea.css({
            'display': 'flex',
            'align-items': 'center',
        });
        inputArea[0].style.setProperty('height', `${inputArea.find('.chat-input').height() + 4}px`, 'important');
        inputArea[0].style.setProperty('padding', '0', 'important');
        inputArea.find('#reply-spacer').css({
            'flex-shrink': '0',
            'width': inputArea.height()
        });
        inputArea.find('#reply-count').css({
            'position': 'static',
            'top': 'auto',
            'left': 'auto',
            'padding': '0',
            'width': '20px',
            'height': '20px',
            'margin': '0',
            'margin-left': 'auto',
            'margin-right': 'auto'
        });
        inputArea.find('#tabcomplete-container').css({
            'top': '-29px'
        });

        // Clean up the info area. Discard what we don't need and move the rest
        // (description + room controls) up to a full-width header bar.
        doc.find('#info').attr('id', 'info-trash');
        let info = $('<div/>')
        .attr('id', 'info')
        .append(doc.find('#roomdesc').css('flex-grow', '1'))
        .append(doc.find('#toggle-favorite').css('flex-shrink', '0'))
        .append(doc.find('#sound').css('flex-shrink', '0'))
        .append(doc.find('#room-menu').css('flex-shrink', '0'))
        .prependTo(doc.find('#sidebar-content'));
        doc.find('#info-trash').remove();
        info.prependTo(doc.find('body')).css({
            'position': 'fixed',
            'top': '0px',
            'left': '0px',
            'width': 'calc(100% - 8px)', // padding offset
            'height': 'auto',
            'padding': '4px',
            'z-index': '1000',
            'display': 'flex',
            'align-items': 'center',
            'background': doc.find('#input-area').css('background'),
            'background-position-y': 'bottom',
            'color': doc.find('#input-area').css('color')
        }).children().css({
            'display': 'inline-block'
        });
        info.find('a').css('color', inputLinkColor);
        info.find('#sound').css({
            'position': 'relative',
            'top': '1px',
            'left': '2px',
            'margin-left': '1ex',
            'margin-right': '1ex'
        });

        // Rest of the sidebar.
        doc.find('#my-rooms').closest('.sidebar-widget').remove();
        doc.find('#rejoin-favs').closest('.sidebar-widget').remove();
        doc.find('#widgets .sidebar-widget:last').remove();

        // Main chat area.
        doc.find('#chat').css('padding-bottom', `${inputArea.height()}px`);
        doc.find('#container').css({
            'padding-left': '0',
            'padding-right': '0',
            'padding-bottom': '2px'
        });

        // Use the top margin of the chat area and sidebar to make space for the new
        // room info header.
        doc.find('#container, #sidebar').css({
            'margin-top': `${info.height() + 8}px`
        });

        // The sidebar now contains only the room inhabitant avatars. Make it a bit
        // narrower and resize the chat area to match.
        doc.find('#sidebar').css({
            'padding-right': '0',
            'width': '120px'
        });
        doc.find('#main').css({
            'width': `calc(100% - ${doc.find('#sidebar').width()}px)`
        });

        // Just for now until I figure out what to do with star wall.
        doc.find('#starred-posts').closest('.sidebar-widget').remove();

        // Disable image uploader. It can't work in an iframe because of line 4191 (in the
        // prettified version) of master-chat.js, where initFileUpload() uses top.document
        // as the basis for all the new elements, so the uploader stuff ends up being created
        // in our actual page instead of in the frame (and no, moving the uploader elements
        // back into the iframe doesn't work, it's already busted at that point).
        doc.find('#upload-file').remove();

    }

    function load (key, def) {
        try {
            let value = GM_getValue(key, null);
            return (value === null || value === undefined) ? def : JSON.parse(value);
        } catch (e) {
            return def;
        }
    }

    function store (key, value) {
        try {
            if (value === null || value === undefined)
                GM_deleteValue(key);
            else
                GM_setValue(key, JSON.stringify(value));
        } catch (e) {
            console.error(e);
        }
    }

    function dump () {
        for (let key of GM_listValues())
            console.log(`${key} => ${GM_getValue(key, null)}`);
    }

})();
