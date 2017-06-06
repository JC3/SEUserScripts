// ==UserScript==
// @name         Multi Chat
// @namespace    http://stackexchange.com/users/305991/jason-c
// @version      0.01-alpha
// @description  Multiple chat rooms in one window.
// @author       Jason C
// @match        *://chat.stackoverflow.com/multichat
// @match        *://chat.stackexchange.com/multichat
// @match        *://chat.meta.stackexchange.com/multichat
// @grant        unsafeWindow
// ==/UserScript==

(function() {
    'use strict';

    var baseTitle;
    switch (window.location.hostname) {
        case 'chat.stackoverflow.com': baseTitle = 'SO Multi Chat'; break;
        case 'chat.stackexchange.com': baseTitle = 'SE Multi Chat'; break;
        case 'chat.meta.stackexchange.com': baseTitle = 'MSE Multi Chat'; break;
    }

    unsafeWindow.MultiChat = {
        openChatRoom: openChatRoom,
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

            openChatRoom('https://chat.meta.stackexchange.com/rooms/89');

        }).promise();

    }

    // Pass in a string url, or an object {server, roomid}
    function openChatRoom (target) {

        let server, roomid;

        if (typeof target === 'string') {
            let urlparser = document.createElement('a');
            urlparser.href = target;
            server = urlparser.hostname;
            roomid = /rooms\/([0-9]+)/.exec(urlparser.pathname);
            roomid = roomid && roomid[1];
        } else if (target && target.roomid) {
            server = target.server || window.location.hostname;
            roomid = target.roomid;
        } else {
            console.log('invalid params to openChatRoom');
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
                width: 1000,
                height: 500,
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
        }

        $(`.multichat[data-roomid="${roomid}"]`).dialog('open');

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

        var roomName = doc.find('#roomname').text().trim();
        var inputArea, roomMenu;
        dlg.dialog('option', 'title', roomName);
        doc.find('#reply-count').insertBefore(doc.find('#bubble'));
        doc.find('#input-table tr:first td:first').remove();
        doc.find('#input-table td.chat-input').removeAttr('rowspan').css({
            'padding': '2px'
        });
        doc.find('#footer-logo').remove();
        doc.find('#footer-legal').closest('tr').remove();
        doc.find('#input').css({height:'auto'}).attr('rows', 2);
        (inputArea = doc.find('#input-area')).css({
            'padding': '0',
            'height': `calc(10px + ${doc.find('#input').height()}px)`
        });
        doc.find('#bubble').css({
            'height': 'auto',
            'width': 'auto',
            'padding-left': '38px'
        });
        doc.find('#reply-count').css({
            top: '7px',
            left: '7px'
        });
        doc.find('#chat-buttons').css({
            'padding': '2px',
            'padding-bottom': '5px',
            'vertical-align': 'middle'
        });
        doc.find('#tabcomplete-container').css('top', '-33px');
        doc.find('#chat').css('padding-bottom', `${inputArea.height()}px`);
        doc.find('#container').css({
            'padding-left': '0',
            'padding-right': '0',
            'padding-bottom': '2px'
        });
        doc.find('#allrooms, #searchbox, #roomname, #room-tags').remove();
        doc.find('#my-rooms').closest('.sidebar-widget').remove();
        doc.find('#rejoin-favs').closest('.sidebar-widget').remove();
        doc.find('#widgets .sidebar-widget:last').remove();
        doc.find('.feed-icon').closest('a').remove();
        (roomMenu = doc.find('#room-menu')).closest('#sidebar-menu').empty().append(roomMenu);
    }

})();
