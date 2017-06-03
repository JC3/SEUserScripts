// ==UserScript==
// @name         Top bar in chat.
// @namespace    https://stackexchange.com/users/305991/jason-c
// @version      1.00
// @description  Add top bar to chat windows.
// @author       Jason C
// @match        *://chat.meta.stackexchange.com/rooms/*
// @match        *://chat.stackexchange.com/rooms/*
// @match        *://chat.stackoverflow.com/rooms/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    var frame = $('<iframe/>')
       .css('display', 'none')
       .attr('src', `//${window.location.host}`)
       .appendTo('body');

    frame.load(function () {

        var topbar = window.frames[0].$('.topbar');
        var link = topbar.parent().find('link[rel="stylesheet"][href*="topbar"]');

        // Make a new link instead of stealing the existing one to force a reload so we
        // can hook it below. If we simply move the link, while the CSS does reload, it
        // doesn't seem to trigger a load() callback.
        link = $('<link/>')
            .attr('rel', 'stylesheet')
            .attr('href', link.attr('href'));

        // Steal topbar from iframe.
        $('head').append(link);
        $('body').prepend(topbar);

        // Float topbar at top of window.
        topbar.css({
            position: 'fixed',
            top: 0,
            'z-index': 100,
            opacity: 1
        });

        // Search box ID conflicts with sidebar searchbox. Change it.
        topbar.find('#searchbox').attr('id', 'topbar_searchbox');

        // Must wait for css to load before topbar.height() becomes valid.
        link.load(function () {

            // Put a white div behind it, easier than trying to futz with opacity component of
            // background color.
            $('<div/>').css({
                background: 'white',
                margin: 0,
                padding: 0,
                position: 'fixed',
                top: 0,
                'z-index': 99,
                height: `${topbar.height()}px`,
                width: '100%'
            }).prependTo('body');

            // Make room for the topbar.
            $('#container, #sidebar').css({
                'margin-top': `${topbar.height()}px`
            });

        });

        // Hide topbar dropdowns on click (the SE JS object is in the frame).
        $(window).click(function () {
            window.frames[0].StackExchange.topbar.hideAll();
        });
        $('.avatar, .action-link, #room-menu').click(function () {
            window.frames[0].StackExchange.topbar.hideAll();
        });

    });

})();