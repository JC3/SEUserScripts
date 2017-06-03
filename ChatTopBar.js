// ==UserScript==
// @name         Top bar in chat.
// @namespace    https://stackexchange.com/users/305991/jason-c
// @version      1.01
// @description  Add a fully functional top bar to chat windows.
// @author       Jason C
// @match        *://chat.meta.stackexchange.com/rooms/*
// @match        *://chat.stackexchange.com/rooms/*
// @match        *://chat.stackoverflow.com/rooms/*
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(function() {
    'use strict';

    const WIDEN_TOPBAR = true; // true = 95% width, false = default fixed width

    // The main chat server page has a topbar and is on the same domain, load it up
    // in an invisible iframe.
    var frame = $('<iframe/>')
       .css('display', 'none')
       .attr('src', `//${window.location.host}`)
       .appendTo('body');

    // Start grabbing the account ID while the frame is loading to minimize load time.
    var defAccountId = getAccountId();

    // Once the frame is loaded, everything happens.
    frame.load(function () {

        var tbframe = window.frames[0];
        var topbar = tbframe.$('.topbar');
        var link = topbar.parent().find('link[rel="stylesheet"][href*="topbar"]');

        // tbframe.StackExchange.options.enableLogging = true;

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

        // Make topbar wider.
        if (WIDEN_TOPBAR)
            topbar.find('.topbar-wrapper').css('width', '95%');

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
            tbframe.StackExchange.topbar.hideAll();
        });
        $('.avatar, .action-link, #room-menu').click(function () {
            tbframe.StackExchange.topbar.hideAll();
        });

        // So, the chat topbar doesn't show realtime notifications (https://meta.stackexchange.com/q/296714/230261),
        // for a number of reasons. We have to re-implement this ourselves by setting up
        // a websocket and subscribing to topbar events (for which we need the user's network
        // account ID).
        defAccountId.then(function (id) {

            if (id === null) {
                console.log('Account ID query failed?');
            } else {
                let ws = new WebSocket('wss://qa.sockets.stackexchange.com');
                ws.onopen = function () {
                    ws.send(`${id}-topbar`);
                };
                ws.onmessage = function (event) {
                    if (event && event.data) {
                        try {
                            var tbevent = JSON.parse(event.data);
                            if (tbevent && tbevent.data)
                                tbframe.StackExchange.topbar.handleRealtimeMessage(tbevent.data);
                        } catch (e) {
                            // Just ignore, it's a JSON parse error, means event.data wasn't a string or something.
                        }
                    }
                };
            }

        });

        // The chat topbar queries /topbar/get-unread-counts on init. This can be kludged to
        // be compatible with StackExchange.topbar.handleRealtimeMessage and polled for
        // status. NOTE: This sucks because get-unread-counts is stale. Keeping this code
        // here just for reference but the websocket above works great.
        /*
        window.setInterval(function () {
            $.get('/topbar/get-unread-counts', function (e) {
                console.log(JSON.stringify(e));
                tbframe.StackExchange.topbar.handleRealtimeMessage(JSON.stringify({
                    'Inbox': e,
                    'Achievements': e
                }));
            });
        }, 10000);
        */

    });

    // Grab the user's network account ID, which doesn't seem to be directly available.
    // anywhere on the chat page. Needed for websocket topbar event subscription. This
    // is done like so:
    //
    //    1. Grab /users/thumbs/<chat_id>
    //    2. Parse a site name and site user ID out of the parent profile link.
    //    3. Use the API to get the network account ID.
    //
    // To save precious API quota, this value is cached, and only requeried if the fkey
    // on the chat page changes, which I figure is a pretty good indicator that e.g.
    // the user logged out then logged in with a different account. The fkey is tracked
    // per chat server to prevent unneeded API calls when switching back and forth from
    // multiple chat servers.
    function getAccountId () {

        return $.Deferred(function (def) {

            let server = window.location.host;
            let fkey = $('#fkey').val();
            let account_cached = load('account', null);

            if (fkey !== load(`${server}-fkey`, null) || account_cached === null) {
                console.log('Obtaining account ID...');
                $.get(`/users/thumbs/${CHAT.CURRENT_USER_ID}`, function (data) {
                    let a = document.createElement('a');
                    a.href = data.profileUrl;
                    let site = a.hostname;
                    let uid = /\/users\/([0-9]+)/.exec(a.pathname)[1];
                    $.get(`//api.stackexchange.com/2.2/users/${uid}?order=desc&sort=reputation&site=${site}&filter=TiTab6.mdk`, function (r) {
                        if (r.items && r.items.length > 0) {
                            store('account', r.items[0].account_id);
                            store(`${server}-fkey`, fkey);
                            def.resolve(r.items[0].account_id);
                        }
                    });
                });
            } else {
                def.resolve(account_cached);
            }

        }).promise();

    }

    // Helper for GM_setValue.
    function store (key, value) {
        try {
            GM_setValue(key, value);
        } catch (e) {
            console.error(e);
        }
    }

    // Helper for GM_getValue.
    function load (key, def) {
        try {
            return GM_getValue(key, def);
        } catch (e) {
            console.error(e);
            return def;
        }
    }

})();