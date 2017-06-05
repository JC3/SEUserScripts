// ==UserScript==
// @name         Top bar in chat.
// @namespace    https://stackexchange.com/users/305991/jason-c
// @version      1.07
// @description  Add a fully functional top bar to chat windows.
// @author       Jason C
// @match        *://chat.meta.stackexchange.com/rooms/*
// @match        *://chat.stackexchange.com/rooms/*
// @match        *://chat.stackoverflow.com/rooms/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_listValues
// @grant        GM_deleteValue
// @grant        unsafeWindow
// ==/UserScript==

(function() {
    'use strict';

    const RECONNECT_WAIT_MS = 500;
    const URL_UPDATES = 'https://stackapps.com/q/7404/25350';
    const URL_MORE = 'https://stackapps.com/search?tab=active&q=user%3a25350%20is%3aq%20%5bscript%5d%20';

    // The main chat server page has a topbar and is on the same domain, load it up
    // in an invisible iframe.
    var frame = $('<iframe/>')
       .css('display', 'none')
       .attr('src', '/')
       .appendTo('body');

    // Start grabbing the account ID while the frame is loading to minimize load time.
    var defAccountId = getAccountId();

    // Start loading jQuery UI dependencies at the same time, too.
    var defJQUI = $.when(
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
    );

    // Provide a console interface for certain functionality. (TBD: Should I be paranoid
    // about this and not do it until *after* frame and styles are loaded? Or maybe just
    // don't expose settings change methods any more since there's a dialog now? Hmm...)
    unsafeWindow.ChatTopBar = {
        setWiden: setWiden,
        setThemed: setThemed,
        setBrightness: setBrightness,
        setQuiet: setQuiet,
        forgetAccount: () => store('account', null),
        forgetEverything: forgetEverything,
        dumpSettings: dumpSettings,
        fakeUnreadCounts: fakeUnreadCounts
    };

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

        // Search box ID conflicts with sidebar searchbox, breaks styling. Change it.
        topbar.find('#searchbox').attr('id', 'topbar_searchbox');

        // Make search box placeholders a little more accurate (todo: localize?).
        $('#topbar_searchbox').attr('placeholder', 'search all rooms');
        $('#searchbox').attr('placeholder', 'search room');

        // Must wait for css to load before topbar.height() and other styles become valid.
        link.load(function () {

            // Initialize configurable settings.
            setWiden();
            setThemed();
            setBrightness();

            // Put settings link at bottom; we're doing this in here so that we don't make the
            // dialog available to the user before styles are loaded. Probably being paranoid.
            defJQUI.then(function () {
                $('#footer-legal')
                    .prepend(document.createTextNode(' | '))
                    .prepend($('<a href="#" id="ctb-settings-link"/>').text('topbar').click(() => (showSettings(), false)));
            });

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

            // Make room for the topbar. Sidebar must be made smaller so it doesn't hide behind
            // the bottom panel.
            $('#container, #sidebar').css({
                'margin-top': `${topbar.height()}px`
            });
            $('#sidebar').css({
                height: `calc(100% - ${topbar.height()}px`
            });
            $(unsafeWindow).trigger('resize'); // Force sidebar resize, guess SE does it dynamically.

        });

        // Hide topbar dropdowns (and settings dialog) on click (the SE JS object is in the frame).
        $(window).click(function (e) {
            tbframe.StackExchange.topbar.hideAll();
            hideSettingsIfOutside(e.target);
        });
        $('.avatar, .action-link, #room-menu').click(function (e) {
            tbframe.StackExchange.topbar.hideAll();
            hideSettingsIfOutside(e.target);
        });

        // So, the chat topbar doesn't show realtime notifications (https://meta.stackexchange.com/q/296714/230261),
        // for a number of reasons. We have to re-implement this ourselves by setting up
        // a websocket and subscribing to topbar events (for which we need the user's network
        // account ID).
        defAccountId.then(function (id) {

            if (id === null) {
                log('Account ID query failed?');
            } else {
                let realtimeConnect = function () {
                    log(`Opening WebSocket...`);
                    let ws = new WebSocket('wss://qa.sockets.stackexchange.com');
                    ws.onopen = function () {
                        log(`WebSocket opened (your network ID is ${id}).`);
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
                    ws.onerror = function (event) {
                        log(`WebSocket error: ${event.code} (${event.reason})`);
                    };
                    ws.onclose = function (event) {
                        log(`WebSocket closed: ${event.code} (${event.reason}), will reopen in ${RECONNECT_WAIT_MS} ms.`);
                        window.setTimeout(realtimeConnect, RECONNECT_WAIT_MS);
                    };
                };
                realtimeConnect();
            }
        });

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
    // multiple chat servers. Returns a promise.
    function getAccountId () {

        // If user is not logged in CHAT.CURRENT_USER_ID will be 0 and there will
        // be some errors below, but I don't see any need to handle it more gracefully
        // right now since we still end up with a properly functioning topbar.
        return $.Deferred(function (def) {

            let server = window.location.host;
            let fkey = $('#fkey').val();
            let account_cached = load('account', null);

            if (fkey !== load(`fkey-${server}`, null) || account_cached === null) {
                log(`Obtaining parent profile (your chat ID is ${CHAT.CURRENT_USER_ID})...`);
                $.get(`/users/thumbs/${CHAT.CURRENT_USER_ID}`, function (data) {
                    let a = document.createElement('a');
                    a.href = data.profileUrl;
                    let site = a.hostname;
                    let uid = /\/users\/([0-9]+)/.exec(a.pathname)[1];
                    log(`Obtaining network ID (your parent ID is ${uid} on ${site})...`);
                    $.get(`//api.stackexchange.com/2.2/users/${uid}?order=desc&sort=reputation&site=${site}&filter=TiTab6.mdk`, function (r) {
                        if (r.items && r.items.length > 0) {
                            store('account', r.items[0].account_id);
                            store(`fkey-${server}`, fkey);
                            def.resolve(r.items[0].account_id);
                        }
                    });
                });
            } else {
                def.resolve(account_cached);
            }

        }).promise();

    }

    // Show settings popup.
    function showSettings () {

        // Initialize dialog first time through.
        if ($('#chattopbar-settings-dialog').length === 0) {
            let title = (typeof GM_info === 'undefined' ? '' : ` (${GM_info.script.version})`);
            $('body').append(
                `<div id="chattopbar-settings-dialog" title="Settings${title}">` +
                '<label><input type="checkbox" name="themed" onchange="ChatTopBar.setThemed(this.checked)"><span>Use chat room themes</span></label>' +
                '<label><input type="checkbox" name="widen" onchange="ChatTopBar.setWiden(this.checked)"><span>Wide layout</span></label>' +
                '<label><input type="checkbox" name="quiet" onchange="ChatTopBar.setQuiet(this.checked)"><span>Suppress console output</span></label><hr>' +
                '<label class="ctb-fixheight"><span>Brightness (this room only):</span></label>' +
                '<div class="ctb-fixheight"><div style="flex-grow:1" id="chattopbar-settings-brightness"></div></div><hr>' +
                `<div class="ctb-fixheight"><a href="${URL_UPDATES}">Updates</a>&nbsp;|&nbsp;<a href="${URL_MORE}">More Scripts</a></div>` +
                '</div>');
            let elem = $('#chattopbar-settings-dialog');
            elem.find('hr').css({'border':'0', 'border-bottom':$('#present-users').css('border-bottom')});
            elem.find('label, .ctb-fixheight').css({'display':'flex', 'align-items':'center'});
            let rowHeight = $('input[name="themed"]').closest('label').css('height');
            elem.find('.ctb-fixheight').css({'height':rowHeight, 'justify-content':'center'});
            elem.find('a').css('color', $('#sidebar-menu a').css('color')); // Because #input-area a color is too light.
            let work = elem.find('#chattopbar-settings-brightness');
            work.slider({
                min: 0,
                max: 200,
                value: 100,
                slide: (_,ui) => setBrightness(ui.value / 100.0),
                classes: {
                    'ui-slider': '',
                    'ui-slider-handle': '',
                    'ui-slider-range': ''
                }
            });
            let sliderMargin = work.find('.ui-slider-handle').css('width');
            work.css('margin', `0 calc(${sliderMargin} / 2)`);
            elem.dialog({
                appendTo: '#input-area', // Body can scroll; this will keep us fixed.
                show: 100,
                hide: 100,
                autoOpen: false,
                width: 'auto',
                height: 'auto',
                resizable: false,
                draggable: false,
                position: {
                    my: 'center bottom',
                    at: 'center top',
                    of: '#ctb-settings-link'
                },
                classes: {
                    'ui-dialog': 'topbar-dialog',
                    'ui-dialog-content': '',
                    'ui-dialog-buttonpane': '',
                    'ui-dialog-titlebar': '',
                    'ui-dialog-titlebar-close': '',
                    'ui-dialog-title': ''
                }
            });
        }

        // Toggle visibility.
        let dialog = $('#chattopbar-settings-dialog');
        if (dialog.dialog('isOpen')) {
            dialog.dialog('close');
        } else {
            dialog.find('[name="widen"]').prop('checked', setWiden());
            dialog.find('[name="themed"]').prop('checked', setThemed());
            dialog.find('[name="quiet"]').prop('checked', setQuiet());
            dialog.find('#chattopbar-settings-brightness').slider('value', 100.0 * setBrightness());
            dialog.dialog('open');
        }

    }

    // Hide settings dialog if target element is outside the dialog. Used when
    // processing global mouse click events.
    function hideSettingsIfOutside (target) {

        target = $(target);
        let dialog = $('#chattopbar-settings-dialog');

        // https://stackoverflow.com/a/11003694
        if (dialog.length > 0 && dialog.dialog('isOpen') &&
            !target.is('.ui-dialog') && target.closest('.ui-dialog').length === 0)
            dialog.dialog('close');

    }

    // Set topbar width option. True sets width to 95%, false uses default, null or
    // undefined loads the persistent setting. Saves setting persistently. Returns
    // the value of the option.
    function setWiden (widen) {

        if (widen === null || widen === undefined)
            widen = load('widen', true);
        else
            store('widen', widen);

        let wrapper = $('.topbar-wrapper');
        if (wrapper.length > 0) {
            // First time through, store defaults.
            if (wrapper.data('original-width') === undefined)
                wrapper.data('original-width', wrapper.css('width'));
            // Match the right side padding for wide mode, lines up nice.
            if (widen) {
                let r1 = $('#sidebar').css('padding-right');
                let r2 = $('#info').css('padding-right');
                wrapper.css('width', `calc(100% - 2 * ( ${r1} + ${r2} ) )`);
            } else {
                wrapper.css('width', wrapper.data('original-width'));
            }
        }

        return widen;

    }

    // Set topbar themed option. True uses chat theme, false uses default theme, null
    // or undefined loads the persistent setting. Saves setting persistently. Returns
    // the value of the option.
    function setThemed (themed) {

        if (themed === null || themed === undefined)
            themed = load('themed', false);
        else
            store('themed', themed);

        let topbar = $('.topbar');
        if (topbar.length > 0) {
            // First time through, store defaults.
            if (topbar.data('original-background') === undefined) {
                topbar.data('original-background', topbar.css('background'));
                topbar.data('original-background-position-y', topbar.css('background-position-y'));
            }
            // Take background from bottom area.
            topbar.css('background', themed ? $('#input-area').css('background') : topbar.data('original-background'))
                  .css('background-position-y', themed ? 'bottom' : topbar.data('original-background-position-y')); // Nicer on sites like RPG.
        }

        setBrightness();

        return themed;

    }

    // Set topbar element brightness. 1.0 is no change. Null or undefined loads the
    // persistent setting. Saves setting persistently. Brightness is *per-room* and
    // only has an effect when theme is enabled. Returns the value of the option.
    function setBrightness (brightness) {

        let key = `brightness-${window.location.host}-${CHAT.CURRENT_ROOM_ID}`;
        if (brightness === null || brightness === undefined)
            brightness = load(key, 1.0);
        else
            store(key, brightness);

        let themed = load('themed', false);
        $('.topbar-icon, .topbar-menu-links').css('filter', `brightness(${themed ? brightness : 1.0})`);

        return brightness;

    }

    // Set quiet mode option. Default is false. Null or undefined loads the persistent
    // setting. Saves setting persistently. Returns the value of the option.
    function setQuiet (quiet) {

        if (quiet === null || quiet === undefined)
            quiet = load('quiet', false);
        else
            store('quiet', quiet);

        return quiet;

    }

    // Set notification counts, for style debugging.
    function fakeUnreadCounts (inbox, rep) {
        window.frames[0].StackExchange.topbar.handleRealtimeMessage(JSON.stringify({
            'Inbox': { 'UnreadInboxCount': inbox },
            'Achievements': { 'UnreadRepCount': rep }
        }));
    }

    // Print all settings to console, for debugging.
    function dumpSettings () {
        for (let key of GM_listValues().sort())
            console.log(`${key} => ${load(key)}`);
    }

    // Reset all settings.
    function forgetEverything (noreload) {
        for (let key of GM_listValues()) {
            try {
                GM_deleteValue(key);
            } catch (e) {
                console.error(e);
            }
        }
        if (!noreload)
            document.location.reload();
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

    // Helper for console.log.
    function log (msg) {
        if (!setQuiet())
            console.log(`Chat Top Bar: ${msg}`);
    }

})();