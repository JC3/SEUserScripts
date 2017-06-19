// ==UserScript==
// @name         Top bar in chat.
// @namespace    https://stackexchange.com/users/305991/jason-c
// @version      1.14.1
// @description  Add a fully functional top bar to chat windows.
// @author       Jason C
// @include      /^https?:\/\/chat\.meta\.stackexchange\.com\/rooms\/[0-9]+.*$/
// @include      /^https?:\/\/chat\.stackexchange\.com\/rooms\/[0-9]+.*$/
// @include      /^https?:\/\/chat\.stackoverflow\.com\/rooms\/[0-9]+.*$/
// @match        *://chat.meta.stackexchange.com/chats/join/favorite?ctbjoin
// @match        *://chat.stackexchange.com/chats/join/favorite?ctbjoin
// @match        *://chat.stackoverflow.com/chats/join/favorite?ctbjoin
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_listValues
// @grant        GM_deleteValue
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    const NAMESPACE_UID = '9d2798e5-6d48-488c-924e-899a39b74954';

    // Firefox support: Store working copy of settings in tbData.
    migrateSettings();
    var tbData = {settings: {}, scriptVersion: GM_info.script.version, uid: NAMESPACE_UID };
    for (let key of GM_listValues())
        tbData.settings[key] = GM_getValue(key);

    // Firefox support: Use events for settings instead of GM_* directly.
    window.addEventListener(`setvalue-${NAMESPACE_UID}`, function (ev) {
        GM_setValue(ev.detail.key, ev.detail.value);
    });

    // Firefox support: Use events for settings instead of GM_* directly.
    window.addEventListener(`deletevalue-${NAMESPACE_UID}`, function (ev) {
        GM_deleteValue(ev.detail.key);
    });

    // Firefox support: Make this easier to debug in FF. Instead of letting GM/Tampermonkey
    // run the script, inject it into the page and run it from there.
    (function (f, data) {
        let funcstr = f.toString();
        let datastr = JSON.stringify(data);
        let nsstr = encodeURI(GM_info.script.namespace.replace(/\/?$/, '/'));
        let namestr = encodeURIComponent(GM_info.script.name);
        let script = document.createElement('script');
        script.type = 'text/javascript';
        script.textContent = `(${funcstr})(window.jQuery, ${datastr})\n\n//# sourceURL=${nsstr}${namestr}`;
        document.body.appendChild(script);
    })(MakeChatTopbar, tbData);

    // From here on out, this is executed in the unprivileged context of the page itself.
function MakeChatTopbar ($, tbData) {

    // No jQuery? This is not a chat page that we can enhance!
    if (!$)
        return;

    // Auto-click the button on the favorites page if enabled. Note match rule only
    // lets this happen if '?ctbjoin' is in URL, so we're not doing this willy nilly.
    if (document.location.href.includes('/chats/join/favorite')) {
        $('input[value*="join"]').click();
        return;
    }

    // Don't add the top bar if we're in an iframe. This is only here to make this
    // compatible with some other scripts I'm working on. Also never load it on mobile
    // versions of the site.
    try {
        if ($('body').hasClass('mob')) {
            log('Not running on mobile site', true);
            return;
        } else if (window.self !== window.top && !setRunInFrame()) {
            log('Not running in iframe', true);
            return;
        }
    } catch (e) {
        // If browser blocked access to window.top or something, just run. Better to
        // run by accident than not run by accident.
    }

    const RECONNECT_WAIT_MS = 500;
    const AUTO_SEARCH_DELAY_MS = 500;
    const URL_UPDATES = 'https://stackapps.com/q/7404/25350';
    const URL_MORE = 'https://stackapps.com/search?tab=active&q=user%3a25350%20is%3aq%20%5bscript%5d%20';

    // Add a couple useful jQuery functions that we'll use below.
    $.fn.extend({
        ctb_noclick: function () { return this.removeAttr('href').off('click').click(() => false); },
        ctb_linkify: function (no) { return no ? this : this.html(linkify(this.html())); }
    });

    // The main chat server page has a topbar and is on the same domain, load it up
    // in an invisible iframe. Note: We load /faq, because / and the various room tab
    // pages generally make periodic requests to e.g. /rooms and stuff to keep their
    // info up to date, and there's no reason for us to be making background requests
    // that we don't need. The /faq page doesn't do any periodic XHR stuff.
    var frame = $('<iframe/>')
       .css('display', 'none')
       .attr('src', '/faq')
       .appendTo('body');

    // Start grabbing the account ID while the frame is loading to minimize load time.
    var defAccountId = getAccountId();

    // Start loading jQuery UI and jQuery-mousewheel dependencies at the same time, too.
    var defJQUI = $('script[src*="jquery-ui"]').length > 0 ? $.when() : $.when(
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
        }),
        $.Deferred(function (def) {
            // Unfortunately, mousewheel isn't available on googleapis. I was hoping to not
            // add other hosts in case the user has them blocked. TODO: Remove mousewheel
            // dependency, this is only used to help prevent dropdown list overscrolling
            // from scrolling the chat room.
            let s = document.createElement('script');
            s.src = '//cdnjs.cloudflare.com/ajax/libs/jquery-mousewheel/3.1.13/jquery.mousewheel.min.js';
            s.onload = def.resolve;
            s.onerror = function (e) {
                log('Failed to load jQuery-mousewheel, overscroll protection won\'t work, no big deal.', true);
                def.resolve(); // proceed anyway
            };
            document.head.appendChild(s);
        })
    );

    // Provide a console interface for certain functionality. (TBD: Should I be paranoid
    // about this and not do it until *after* frame and styles are loaded? Or maybe just
    // don't expose settings change methods any more since there's a dialog now? Hmm...)
    window.ChatTopBar = {
        setWiden: setWiden,
        setThemed: setThemed,
        setBrightness: setBrightness,
        setQuiet: setQuiet,
        setShowSwitcher: setShowSwitcher,
        setRejoinOnSwitch: setRejoinOnSwitch,
        setOpenRoomsHere: setOpenRoomsHere,
        setAutoSearch: setAutoSearch,
        setSearchByActivity: setSearchByActivity,
        setLinkifyDescriptions: setLinkifyDescriptions,
        setFaviconVisible: setFaviconVisible,
        setFaviconStyle: setFaviconStyle,
        setCompactResults: setCompactResults,
        setAutoLoadMore: setAutoLoadMore,
        setPreserveSearch: setPreserveSearch,
        setRunInFrame: setRunInFrame,
        showChangeLog: showChangeLog,
        forgetAccount: () => forgetSetting('account'),
        forgetEverything: forgetEverything,
        dumpSettings: dumpSettings,
        fakeUnreadCounts: fakeUnreadCounts
    };

    // Once the frame is loaded, everything happens.
    frame.load(function () {

        var tbframe = frame[0].contentWindow;
        var topbar = tbframe.$('.topbar');
        var link = topbar.parent().find('link[rel="stylesheet"][href*="topbar"]');

        // tbframe.StackExchange.options.enableLogging = true;

        // Make a new link instead of stealing the existing one to force a reload so we
        // can hook it below. If we simply move the link, while the CSS does reload, it
        // doesn't seem to trigger a load() callback.
        link = $('<link/>')
            .attr('rel', 'stylesheet')
            .attr('href', link.attr('href'));

        // Steal topbar from iframe. Also change its jQuery to be ours so that deferred
        // load functions and stuff (i.e. the site switcher search box) can find topbar
        // elements (yeah, hack alert).
        $('head').append(link);
        $('body').prepend(topbar);
        tbframe.$ = tbframe.jQuery = jQuery;

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

        // Install DOM mutation observers for modifying SE dropdown when it's loaded.
        watchSEDropdown(topbar);

        // Add chat room search dropdown.
        createRoomSearchDropdown(topbar);

        // Hide topbar dropdowns (and settings dialog) on click (the SE JS object is in the frame).
        $(window).click(function (e) {
            if (e.target.tagName.toLowerCase() === 'a' || $(e.target).closest('.topbar-dialog').length === 0) {
                tbframe.StackExchange.topbar.hideAll();
                toggleRoomSearchDropdown('clickout');
            }
            hideSettingsIfOutside(e.target);
        });
        $('.avatar, .action-link, #room-menu').click(function (e) {
            tbframe.StackExchange.topbar.hideAll();
            toggleRoomSearchDropdown('clickout');
            hideSettingsIfOutside(e.target);
        });

        // The icon-flag thing is static, and does not disappear on click or respond
        // to realtime messages. If it happened to be there, remove  it
        // when the user clicks on it so it doesn't stick around forever.
        topbar.find('.icon-flag').click(function () {
            $(this).toggle(false);
            return true;
        });

        // Must wait for css to load before topbar.height() and other styles become valid.
        link.load(function () {

            // Initialize configurable settings.
            setWiden();
            setThemed();
            setBrightness();
            setFaviconVisible();
            setFaviconStyle();
            setCompactResults();
            setSearchByActivity(); // Sets data-mc-result-sort for compact mode styling.

            // Put settings link at bottom; we're doing this in here so that we don't make the
            // dialog available to the user before styles are loaded. Probably being paranoid.
            defJQUI.then(function () {
                $('#footer-legal')
                    .prepend(document.createTextNode(' | '))
                    .prepend($('<a href="#" id="ctb-settings-link"/>').text('topbar').click(() => (showSettings(), false)));
                checkUpdateNotify();
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

            // Do stuff to compensate for topbar size: Make room for the topbar, sidebar must
            // be made smaller so it doesn't hide behind the bottom panel, etc.
            $('#container, #sidebar').css({
                'margin-top': `${topbar.height()}px`
            });
            $('#sidebar').css({
                height: `calc(100% - ${topbar.height()}px)`
            });
            $(window).trigger('resize'); // Force sidebar resize, guess SE does it dynamically.
            installReplyScrollHandler(topbar.height()); // Also take over scrolling for reply buttons, see comments there.

        });

        // So, the chat topbar doesn't show realtime notifications (https://meta.stackexchange.com/q/296714/230261),
        // for a number of reasons. We have to re-implement this ourselves by setting up
        // a websocket and subscribing to topbar events (for which we need the user's network
        // account ID).
        defAccountId.then(function (id) {

            if (id === null) {
                log('Not opening WebSocket (no account ID).');
            } else {
                let realtimeConnect = function () {
                    log('Opening WebSocket...');
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

        // If user is not logged in CHAT.CURRENT_USER_ID will be 0.
        return $.Deferred(function (def) {

            if (CHAT.CURRENT_USER_ID === 0) {
                log('Cannot get account ID: You are not logged in.');
                def.resolve(null);
                return;
            }

            let server = window.location.host;
            let fkey = $('#fkey').val();
            let account_cached = load('account', null);

            if (fkey !== load(`fkey-${server}`, null) || !account_cached) {
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

    // https://github.com/JC3/SEUserScripts/issues/9: Clicking reply links scrolls
    // to comment but hides under topbar. However, they aren't actual anchor links,
    // the scrolling is handled in master-chat.js, so there's no target anchors to
    // offset. Also the scrollbar is on the body so any kind of spacer we add
    // scrolls along with chat and doesn't help. So we have to reimplement the SE
    // scrolling behavior. This function installs a new click event handler for all
    // .reply-info buttons on the page, and also monitors for new ones so that they
    // can be modified as well.
    function installReplyScrollHandler (correction) {

        // Watch for new .reply-info's so we can take over their scroll behavior.
        new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach(function (added) {
            let id = added && added.getAttribute && added.getAttribute('id');
            let el;
            if (id && id.startsWith('message-') && (el = added.getElementsByClassName('reply-info')).length > 0) {
                $(el[0]).off('click').click(() => handleReplyScroll(el[0], correction));
            }
        }))).observe(document.getElementById('chat'), {
            childList: true,
            subtree: true
        });

        // Also fix any reply-info's that may have existed before we started observing.
        $('.reply-info').off('click').click(function () { return handleReplyScroll(this, correction); });

        // Temporary workaround for https://meta.stackexchange.com/q/297021.
        $('<style type="text/css">.message.highlight{margin-right:0 !important;}</style>').appendTo('head');

    }

    // New click handler for .reply-info items. Emulates SE behavior:
    //   - Scroll to message if its on page, and highlight it for 2 seconds.
    //   - Open the message in a transcript link (return true) if its not on page.
    // The 'correction' parameter is the scroll position offset (topbar height).
    function handleReplyScroll (reply, correction) {

        let to = /#([0-9]+)/.exec(reply.getAttribute('href'));
        if (!(to = to[1]))
            return true;

        let message = $(`#message-${to}`);
        let target = message.closest('.user-container');
        if (target.length === 0)
            return true;

        message.addClass('highlight');
        window.setTimeout(function () {
            message.removeClass('highlight');
        }, 2000);

        $('html, body').animate({
            scrollTop: target.offset().top - correction
        }, {
            duration: 200,
            queue: false
        });

        return false;

    }

    // Install hooks necessary to add chat server list to the SE dropdown, which is loaded
    // as needed and not initially present. Be careful not to call this more than once.
    function watchSEDropdown (topbar) {

        // Readability is for the birds. Looking forward to forgetting what this does some day.
        new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach(function (a) {
            if (a.classList && a.classList.contains('siteSwitcher-dialog') && a.getElementsByTagName('link').length > 0) {
                log('SE dropdown loaded.');
                // Select insert point explicitly, ajax loader icon may still be there at this point.
                // Also, still not sure which of the following two options I like better:
                //let insert = $(a).find('.current-site-container').prev('.header');
                let insert = $(a).find('#your-communities-header');
                // Build and add the chat switcher section.
                $('<div class="header ctb-chat-switcher"><h3>CHAT SERVERS</h3></div>')
                    .insertBefore(insert);
                $('<div class="modal-content ctb-chat-switcher" id="ctb-chat-servers"><ul class="my-sites"/></div>')
                    .insertBefore(insert)
                    .find('.my-sites')
                    .append($('<li><a class="site-link" href="//chat.stackexchange.com"><div class="site-icon favicon favicon-stackexchange"></div> Stack Exchange Chat</a></li>'))
                    .append($('<li><a class="site-link" href="//chat.stackoverflow.com"><div class="site-icon favicon favicon-stackoverflow"></div> Stack Overflow Chat</a></li>'))
                    .append($('<li><a class="site-link" href="//chat.meta.stackexchange.com"><div class="site-icon favicon favicon-stackexchangemeta"></div> Meta Stack Exchange Chat</a></li>'));
                $('#ctb-chat-servers a.site-link').each(function (_, link) {
                    if (link.hostname == document.location.hostname)
                        $(link).css('font-weight', 'bold');
                    $(`<span class="rep-score"><a class="ctb-chat-switch" target="_top" data-ctb-host="${link.hostname}">switch</a></span>`).insertBefore(link);
                });
                setRejoinOnSwitch(); // Will set switch link hrefs.
                setShowSwitcher();
            }
            if (a.classList && a.classList.contains('topbar-dialog') && a.getElementsByTagName('link').length > 0) {
                log('Generic topbar dropdown loaded.');
                // Stop dropdown over-scrolling from scrolling chat window (adapted from https://stackoverflow.com/a/10514680):
                let dropdown = $(a);
                let isgeneric;
                if ((isgeneric = !dropdown.hasClass('siteSwitcher-dialog'))) // only site-switcher has scrollbar at top level
                    dropdown = dropdown.find('.modal-content:first');
                blockOverscrollEvents(dropdown, isgeneric);
            }
        }))).observe(topbar.find('.js-topbar-dialog-corral')[0], {
            childList: true,
            subtree: true
        });

    }

    // Stop over-scrolling on an element from scrolling chat window (adapted from https://stackoverflow.com/a/10514680).
    // outer = true to use outer height, false to use "regular" height.
    function blockOverscrollEvents (elem, outer) {
        elem.off("mousewheel")
            .on("mousewheel", function (event) {
                // Note: grab height every time in case the dialogs aren't fully laid out
                // when this handler is installed, or the scroll height changes (e.g. the
                // SE dropdown site filter changes the scroll height).
                let height = outer ? elem.outerHeight() : elem.height(), sheight = elem[0].scrollHeight;
                let block = ((this.scrollTop === sheight - height && event.deltaY < 0) ||
                             (this.scrollTop === 0 && event.deltaY > 0));
                return !block;
            });
    }

    // Create and initialize the room search dropdown.
    function createRoomSearchDropdown (topbar) {

        // Add a button for it.
        let icon = $('<span class="topbar-icon icon-inbox"/>')
            .css({
                'background-position-x': -101,
                'background-position-y': 0,
                'width': 18,
                'height': 18,
                'top': 8,
                'margin': '0 9px',
                'filter': `brightness(${133.0/160.0})` // Make it match the other icons.
            });
        $('<a href="#" class="topbar-icon yes-hover" id="mc-roomfinder-button"/>')
            .attr('title', 'Chat room list')
            .append($('<span class="hidden-text">Chat room list</span>'))
            .append(icon)
            .appendTo(topbar.find('.network-items'))
            .mouseenter((e) => (toggleRoomSearchDropdown('enter', e.target), false))
            .click((e) => (toggleRoomSearchDropdown('click', e.target), false))
            .css({
                'background-position-x': -(220 - 72),
                'background-position-y': -(54 - 36)
            });

        // We'll need to add mouseenter handlers for the other buttons to support topbar
        // style behaviors. More comments in toggleRoomSearchDropdown().
        topbar.find('.network-items > .topbar-icon:not(#mc-roomfinder-button)')
            .mouseenter((e) => (toggleRoomSearchDropdown('away', e.target), false));

        // Create the dropdown. We might as well put it in the corral with the others.
        let search;
        let roomlist;
        let dropdown = $('<div class="topbar-dialog" id="mc-roomfinder-dialog"/>')
            .append($('<div class="header" style="padding-top:0;padding-bottom:0;">')
                    .append($('<h3 style="padding-top:7px;padding-bottom:7px;">chat rooms</h3>'))
                    .append($('<select id="mc-roomfinder-tab"></select></div>')))
            .append(search = $('<div class="modal-content"/>'))
            .append(roomlist = $('<div class="modal-content" id="mc-roomfinder-results"/>'))
            .appendTo(topbar.find('.js-topbar-dialog-corral'))
            .data('mc-display', 'flex')
            .css({
                'display': 'none',
                'width': 375,
                'min-height': 420, // Same as site switcher (inbox/achievements are 390).
                'max-height': 420,
                'font-size': '12px',
                'flex-direction': 'column'
            });
        $('<div class="site-filter-container"/>')
            .css('display', 'flex')
            .append($('<input type="text" class="site-filter-input" id="mc-roomfinder-filter" placeholder="Find a chat room"/>').css('flex-grow', '1'))
            .append($('<button id="mc-roomfinder-go">SEARCH</button>').css({
                'margin': '5px 0 5px 5px',
                'padding': '3px',
                'font-size': '11px'
            }))
            .appendTo(search);
        $('<a href="#" class="mc-result-container" id="mc-result-more"\>')
            .text('No results.')
            .appendTo(roomlist);
        $('#mc-roomfinder-tab') // Note: 'site' is not currently useful, requires a host and I have no UI for it.
            .append($('<option/>').text('all'))
            .append($('<option/>').text('mine'))
            .append($('<option/>').text('favorite'))
            .change(function () { doRoomSearch(); });
        dropdown.find('.header, .model-content').css('flex-shrink', '0');
        dropdown.find('.modal-content').css('padding', 0);
        search.find('button').click(() => (doRoomSearch(), false));
        roomlist.css({
            'flex-grow': '1',
            'max-height': 'none',
            'overflow-x': 'hidden',
            'overflow-y': 'scroll'
        });
        blockOverscrollEvents(roomlist);

        // Auto load more results scroll handler.
        roomlist[0].onscroll = function (event) {
            if (roomlist[0].scrollTop + roomlist[0].offsetHeight >= roomlist[0].scrollHeight - 2) {
                if (setAutoLoadMore() && $('#mc-result-more').data('mc-auto-click'))
                    $('#mc-result-more').data('mc-auto-click', false).click();
            }
        };

        // If search parameters were preserved, restore them now.
        let preserved = restoreSearchParams();
        if (preserved) {
            $('#mc-roomfinder-filter').val(preserved.filter);
            $('#mc-roomfinder-tab').val(preserved.tab);
        }

        // I'm sick of typing .css() everywhere. Style the search results in a stylesheet.
        // Note: We're cheating a little and styling select elements in the settings dialog
        // here, too. Should probably reorganize the stylesheets if this gets complicated.
        $('<style type="text/css"/>').text(`
            .mc-result-container { padding: 10px; border-top: 1px solid #eff0f1; line-height: 1.3; display:block; }
            .mc-result-container[href]:hover { background: #f7f8f8; }
            .mc-result-container a:hover { text-decoration: underline; }
            .mc-result-title { margin-bottom: 4px; pointer-events: none; }
            .mc-result-title img { display: none; position: relative; top: -1px; }
            .mc-result-title .mc-result-users { float: right; }
            .mc-result-description { margin-bottom: 4px; color: #2f3337; }
            .mc-result-info, .mc-result-users, .mc-result-activity { color: #848d95; }
            .mc-result-compact-only { display: none; }
            .mc-result-current .mc-result-title { font-weight: bold; }
            .mc-result-current .mc-result-title > * { font-weight: normal; }
            .mc-favicon-visible .mc-result-title img { display: block; float: right; }
            .mc-favicon-visible[data-mc-favicon-style="left"] .mc-result-title img { float: left !important; margin-right: 1ex; }
            .mc-favicon-visible[data-mc-favicon-style="margin"] .mc-result-title img { float: left !important; margin-right: 1ex; }
            .mc-favicon-visible[data-mc-favicon-style="margin"] .mc-result-description { margin-left: calc(16px + 1ex); }
            .mc-favicon-visible[data-mc-favicon-style="margin"] .mc-result-info { margin-left: calc(16px + 1ex); }
            .mc-favicon-visible[data-mc-favicon-style="right"].mc-compact-finder .mc-result-users { margin-right: 1ex; }
            .mc-favicon-visible[data-mc-favicon-style="right"].mc-compact-finder .mc-result-activity { margin-right: 1ex; }
            .mc-compact-finder .mc-result-container { padding: 5px 10px; }
            .mc-compact-finder .mc-result-title { margin-bottom: inherit; pointer-events: auto; }
            .mc-compact-finder .mc-result-description { display: none; }
            .mc-compact-finder .mc-result-info { display: none; }
            .mc-compact-finder .mc-result-compact-only { display: initial; }
            .mc-compact-finder[data-mc-result-sort="users"] .mc-result-activity { display: none }
            .mc-compact-finder[data-mc-result-sort="activity"] .mc-result-users { display: none }
            .mc-result-users { }
            .mc-result-activity { float: right; }
            #mc-result-more { color: #999; }
            .mc-result-more-link { font-weight: bold; color: #0077cc !important; }
            #mc-roomfinder-tab, #ctb-settings-dialog select { border: 1px solid #cbcbcb; box-shadow: inset 0 1px 2px #eff0f1,0 0 0 #FFF; color: #2f3337; }
            .topbar-dialog.ui-widget select { font-family: inherit; font-size: inherit; }
            /* The following styles prevent theme brightness from affecting hover/on. But they're kinda weird looking. */
            /*.topbar .topbar-icon-on { filter: brightness(1.0) !important; }*/
            /*.topbar .yes-hover:hover { filter: brightness(1.0) !important; }*/
            /*.topbar .topbar-menu-links a:hover { filter: brightness(1.0) !important; }*/
           `).appendTo('head');

        // Site input does this but I don't really like it on the dropdown:
        // #mc-roomfinder-tab:hover { border-color: rgba(0,149,255,0.5); box-shadow: inset 0 1px 2px #e4e6e8,0 0 2px rgba(0,119,204,0.1); }

        // Sets search button visibility.
        setAutoSearch();

        let filter = $('#mc-roomfinder-filter');
        let timerId;
        filter.keyup(function (e) {
            let auto = filter.data('mc-auto');

            // Enter key searches.
            if (e.keyCode == 13 && !auto)
                $('#mc-roomfinder-go').click();

            // Do auto search 1 second after last key pressed.
            if (timerId) {
                window.clearTimeout(timerId);
                timerId = null;
            }
            if (auto) {
                timerId = window.setTimeout(function () {
                    let cur = filter.val().trim();
                    let old = (filter.data('mc-last-auto') || '');
                    if (cur !== old) {
                        //console.log(`filter change ${old} => ${cur}`);
                        filter.data('mc-last-auto', cur);
                        if (filter.data('mc-auto')) {
                            //console.log('auto search');
                            doRoomSearch();
                        }
                    }
                }, AUTO_SEARCH_DELAY_MS);
            }

        });

    }

    // Show/hide the room search dropdown.
    function toggleRoomSearchDropdown (why, source) {

        let dropdown = $('#mc-roomfinder-dialog');
        let button = $('#mc-roomfinder-button');

        // Figure out what state we're in and what state we should be in. Since the
        // topbar doesn't publicly expose its dialog management functions, we have
        // to implement matching behavior ourselves (hide other dialogs, show on hover,
        // etc.).
        let isVisible = (dropdown.css('display') !== 'none');
        let othersVisible = ($('.network-items > .topbar-icon-on:not(#mc-roomfinder-button)').length > 0);
        let wantVisible;
        let wantOthersVisible = false;

        // All the logic for topbar-compatible click/hover behavior is here:
        if ((why || 'click') === 'click') {  // Clicked on the icon.
            wantVisible = !isVisible;
        } else if (why === 'enter') {        // Mouse entered the icon.
            wantVisible = isVisible || othersVisible;
        } else if (why === 'away') {         // Mouse left the icon.
            wantVisible = false;
            wantOthersVisible = isVisible || othersVisible;
        } else if (why === 'clickout') {     // Clicked outside the dialog.
            wantVisible = false;
            wantOthersVisible = othersVisible;
        } else {
            return;
        }

        // Hide/show native topbar dropdowns as needed.
        if (source && (othersVisible !== wantOthersVisible)) {
            if (wantOthersVisible)
                source.click();
            else
                frame[0].contentWindow.StackExchange.topbar.hideAll();
        }

        // Hide/show room search dropdown as needed.
        if (isVisible !== wantVisible) {
            if (wantVisible) {
                dropdown.css({
                    'display': dropdown.data('mc-display'),
                    'left': button.position().left,
                    'top': button.position().top + $('.topbar').height()
                });
                button.addClass('topbar-icon-on');
            } else {
                dropdown.css('display', 'none');
                button.removeClass('topbar-icon-on');
            }
        }

        // First time it is displayed, load it up with some rooms.
        if (wantVisible && !dropdown.data('mc-shown-once')) {
            dropdown.data('mc-shown-once', true);
            doRoomSearch();
        }

    }

    // Perform room search.
    function doRoomSearch (more) {

        let res = $('#mc-roomfinder-results');
        let status = $('#mc-result-more');
        let sinput = $('#mc-roomfinder-filter');
        let sbutton = $('#mc-roomfinder-go');
        let stab = $('#mc-roomfinder-tab');
        let params;

        sinput.prop('disabled', !sinput.data('mc-auto'));
        sbutton.prop('disabled', true);
        stab.prop('disabled', true);
        status.removeClass('mc-result-more-link').data('mc-auto-click', false)

        // New search vs. loading more results.
        if (more && res.data('mc-params')) {
            // Update status.
            status.toggle(true).ctb_noclick().text('Loading More...');
            // Next page, from data.
            params = res.data('mc-params');
            params.page = (params.page || 1) + 1;
            res.data('mc-params', params);
        } else {
            // Clear existing results and update status.
            status.toggle(true).ctb_noclick().text('Loading...');
            res.find('.mc-result-card').remove();
            // First page, use filter from text box and store it.
            params = {
                tab: stab.val(),
                sort: setSearchByActivity() ? 'active' : 'people',
                filter: sinput.val().trim(),
                pageSize: 20,
                nohide: false
            };
            res.data('mc-params', params);
            sinput.data('mc-last-auto', sinput.val());
        }

        // Run search.
        log(`Running search: ${JSON.stringify(params)}`);
        let nolinks = !setLinkifyDescriptions();
        $.post('/rooms', params).then(function (html) {
            let doc = $('<div/>').html(html);
            doc.find('.roomcard').each(function (_, roomcard) {
                roomcard = $(roomcard);
                let result = {
                    name: roomcard.find('.room-name').text().trim(),
                    description: roomcard.find('.room-description'),
                    activity: roomcard.find('.last-activity'),
                    users: Number(roomcard.find('.room-users').attr('title').replace(/[^0-9]/g, '')),
                    id: Number(roomcard.attr('id').replace(/[^0-9]/g, '')),
                    icon: roomcard.find('.small-site-logo')
                };
                let compactActivity = /^([\w\s]*)/.exec(result.activity.text());
                compactActivity = (compactActivity ? compactActivity[1].trim() : '');
                $(`<a class="mc-result-container mc-result-card mc-result-link${result.id === CHAT.CURRENT_ROOM_ID ? ' mc-result-current' : ''}"\>`)
                    .attr('href', `//${window.location.hostname}/rooms/${result.id}`)
                    .click(() => (preserveSearchParams(params), true))
                    .append($('<div class="mc-result-title"/>')
                         .attr('title', result.description.text().trim())
                         .text(result.name)
                         .append(result.icon.removeClass("small-site-logo"))
                         .append(`<span class="mc-result-users mc-result-compact-only">${withs(result.users, 'user')}</span>`)
                         .append(`<span class="mc-result-activity mc-result-compact-only">${compactActivity}</span>`))
                    .append($('<div class="mc-result-description"/>').html(result.description.html().trim()).ctb_linkify(nolinks))
                    .append($(`<div class="mc-result-info"><span class="mc-result-users">${withs(result.users, 'user')}</span><span class="mc-result-activity">${result.activity.html().trim()}</span></div>`))
                    .appendTo(res);
            });
            if (doc.find('.pager a[rel="next"').length > 0) {
                status
                    .addClass('mc-result-more-link')
                    .toggle(true)
                    .text('Load More...')
                    .off('click')
                    .click(() => (doRoomSearch(true), false))
                    .attr('href', '#')
                    .data('mc-auto-click', true)
                    .appendTo(res);
            } else if (res.find('.mc-result-card').length === 0) {
                status
                    .removeClass('mc-result-more-link')
                    .toggle(true)
                    .text(params.filter === '' ? 'No results.' : `No results for "${params.filter}".`)
                    .ctb_noclick();
            } else {
                status.toggle(false);
            }
            setOpenRoomsHere(); // Update target attribute in result links.
        }).fail(function (e) {
            status
                .removeClass('mc-result-more-link')
                .toggle(true)
                .text('An error occurred.')
                .ctb_noclick();
        }).always(function () {
            sinput.prop('disabled', false);
            sbutton.prop('disabled', false);
            stab.prop('disabled', false);
            if (!sinput.data('mc-auto'))
                sinput.focus();
        });

    }

    // Concatenate a number to a string then pluralize a string.
    function withs (n, str, suffix) {
        return (n === 1) ? `${n} ${str}` : `${n} ${str}${suffix || 's'}`;
    }

    // Show settings popup.
    function showSettings () {

        // If version updated and change log not viewed yet, show that instead.
        if ($('#ctb-settings-link').data('updated')) {
            showChangeLog();
            return;
        }

        // Initialize dialog first time through.
        if ($('#ctb-settings-dialog').length === 0) {
            let title = (typeof tbData.scriptVersion === 'undefined' ? '' : ` (${tbData.scriptVersion})`);
            $('body').append(
                `<div id="ctb-settings-dialog" title="Settings${title}">
                 <label><input type="checkbox" name="themed" onchange="ChatTopBar.setThemed(this.checked)"><span>Use chat room themes</span></label>
                 <label><input type="checkbox" name="widen" onchange="ChatTopBar.setWiden(this.checked)"><span>Wide layout</span></label>
                 <label><input type="checkbox" name="switch" onchange="ChatTopBar.setShowSwitcher(this.checked)"><span>Show chat servers in SE dropdown</span></label>
                 <label><input type="checkbox" name="rejoin" onchange="ChatTopBar.setRejoinOnSwitch(this.checked)"><span>Rejoin favorites on switch</span></label>
                 <label><input type="checkbox" name="autosearch" onchange="ChatTopBar.setAutoSearch(this.checked)"><span>Search for rooms as you type</span></label>
                 <label><input type="checkbox" name="byactivity" onchange="ChatTopBar.setSearchByActivity(this.checked)"><span>Sort rooms by activity instead of people</span></label>
                 <label><input type="checkbox" name="linkify" onchange="ChatTopBar.setLinkifyDescriptions(this.checked)"><span>Linkify URLs in search results</span></label>
                 <label><input type="checkbox" name="open" onchange="ChatTopBar.setOpenRoomsHere(this.checked)"><span>Open search result rooms in this tab</span></label>
                 <span style="display:flex;align-items:center;">
                 <label><input type="checkbox" name="favvis" onchange="ChatTopBar.setFaviconVisible(this.checked)"><span>Display site icons in results:</span></label>
                     &nbsp;<select name="favstyle" onchange="ChatTopBar.setFaviconStyle(this.value)"><option>margin<option>left<option>right</select></label></span>
                 <label><input type="checkbox" name="compact" onchange="ChatTopBar.setCompactResults(this.checked)"><span>Display compact room search results.</span></label>
                 <label><input type="checkbox" name="quiet" onchange="ChatTopBar.setQuiet(this.checked)"><span>Suppress console output</span></label>
                 <hr><label class="ctb-fixheight"><span>Brightness (this theme only):</span></label>
                 <div class="ctb-fixheight"><div style="flex-grow:1" id="ctb-settings-brightness"></div></div><hr>
                 <div class="ctb-fixheight" style="white-space:nowrap"><a href="${URL_UPDATES}">Updates</a>&nbsp;|&nbsp;<a href="${URL_MORE}">More Scripts</a>&nbsp;|&nbsp;<a href="#" id="ctb-show-log">Change Log</a></div>
                 </div>`);
            $('#ctb-show-log').click(() => (showChangeLog(), showSettings(), false));
            let elem = $('#ctb-settings-dialog');
            elem.find('hr').css({'border':'0', 'border-bottom':$('#present-users').css('border-bottom')});
            elem.find('label, .ctb-fixheight').css({'display':'flex', 'align-items':'center'});
            let rowHeight = $('input[name="themed"]').closest('label').css('height');
            elem.find('.ctb-fixheight').css({'height':rowHeight, 'justify-content':'center'});
            elem.find('a').css('color', $('#sidebar-menu a').css('color')); // Because #input-area a color is too light.
            let work = elem.find('#ctb-settings-brightness');
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
        let dialog = $('#ctb-settings-dialog');
        if (dialog.dialog('isOpen')) {
            dialog.dialog('close');
        } else {
            dialog.find('[name="widen"]').prop('checked', setWiden());
            dialog.find('[name="themed"]').prop('checked', setThemed());
            dialog.find('[name="quiet"]').prop('checked', setQuiet());
            dialog.find('[name="rejoin"]').prop('checked', setRejoinOnSwitch());
            dialog.find('[name="switch"]').prop('checked', setShowSwitcher());
            dialog.find('[name="autosearch"]').prop('checked', setAutoSearch());
            dialog.find('[name="byactivity"]').prop('checked', setSearchByActivity());
            dialog.find('[name="linkify"]').prop('checked', setLinkifyDescriptions());
            dialog.find('[name="favvis"]').prop('checked', setFaviconVisible());
            dialog.find('[name="favstyle"]').val(setFaviconStyle());
            dialog.find('[name="compact"]').prop('checked', setCompactResults());
            dialog.find('[name="open"]').prop('checked', setOpenRoomsHere());
            dialog.find('#ctb-settings-brightness').slider('value', 100.0 * setBrightness());
            dialog.dialog('open');
        }

    }

    // Hide settings dialog if target element is outside the dialog. Used when
    // processing global mouse click events.
    function hideSettingsIfOutside (target) {

        target = $(target);
        let dialog = $('#ctb-settings-dialog');

        // https://stackoverflow.com/a/11003694
        if (dialog.length > 0 && dialog.dialog('isOpen') &&
            !target.is('.ui-dialog') && target.closest('.ui-dialog').length === 0)
            dialog.dialog('close');

    }

    // Check if the script has been updated and, if so, do things to make the change
    // log visible.
    function checkUpdateNotify () {

        if (typeof tbData.scriptVersion === 'undefined')
            return;

        let oldVersion = load('changesViewedFor', null);
        let newVersion = /^([0-9]+\.[0-9]+)/.exec(tbData.scriptVersion)[1]; // no flashing for minor versions.
        if (oldVersion === newVersion)
            return;
        else
            log(`Detected update, ${oldVersion} => ${newVersion}`);

        // Highlight the link; it's data property will be read by showSettings(), which
        // will show the change log instead.
        $('#ctb-settings-link').css({
            background: '#0f0',
            color: 'black'
        }).data('updated', newVersion);

        // Blinky blinky.
        let i = window.setInterval(function () {
            let link = $('#ctb-settings-link');
            if (link.data('updated')) {
                if (link.data('flasher'))
                    link.css('background', '#0f0');
                else
                    link.css('background', '#ff0');
                link.data('flasher', link.data('flasher') ? false : true);
            } else {
                window.clearInterval(i);
            }
        }, 500);

    }

    // Shows change log dialog.
    function showChangeLog () {

        // Clear update highlights and remember that the user viewed this.
        if ($('#ctb-settings-link').data('updated')) {
            store('changesViewedFor', $('#ctb-settings-link').data('updated'));
            $('#ctb-settings-link').css({
                background: '',
                color: ''
            }).data('updated', null);
        }

        if ($('#ctb-changes-dialog').length === 0) {
            let title = (typeof tbData.scriptVersion === 'undefined' ? '' : ` (${tbData.scriptVersion})`);
            let devmsg = title.includes('dev') ? ' <b>You\'re using a development version, you won\'t receive release updates until you reinstall from the StackApps page again.</b>' : '';
            $('body').append(`<div id="ctb-changes-dialog" title="Chat Top Bar Change Log${title}">` +
                             `<div class="ctb-important">For details see <a href="${URL_UPDATES}">the StackApps page</a>!${devmsg}</div>${CHANGE_LOG_HTML}</div>`);
            $('.ctb-version-item, .ctb-important').css({'margin-top': '1.5ex', 'font-size': '120%'});
            $('.ctb-version-item').css({'font-weight': 'bold'});
            $('#ctb-changes-list ul').css('margin-left', '2ex');
            $('#ctb-changes-list span').css({'font-family': 'monospace', 'color': '#666'});
            $('#ctb-changes-list ul li').each(function(_, li) {
                let item = $(li);
                let html = item.html();
                item
                    .text('')
                    .css('display', 'flex')
                    .css('margin-top', '0.25ex')
                    .append($('<div>•</div>').css('margin-right', '0.75ex'))
                    .append($('<div/>').html(html));
            });
            blockOverscrollEvents($('#ctb-changes-dialog'), true);
        }

        $('#ctb-changes-dialog').dialog({
            appendTo: '.topbar',
            show: 100,
            hide: 100,
            autoOpen: true,
            width: 500,
            height: 300,
            resizable: true,
            draggable: true,
            modal: true,
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

    // Set topbar width option. True sets width to 95%, false uses default, null or
    // undefined loads the persistent setting. Saves setting persistently. Returns
    // the value of the option.
    function setWiden (widen) {

        widen = loadOrStore('widen', widen, true);

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

    // Get background styles. This is necessary now for Firefox support. Firefox
    // doesn't make this as easy as Chrome. Chrome always returns the full background
    // css for 'background', even if it's not set explicitly. Firefox does not, and all background
    // related styles must be copied one at a time.
    function getBackground (elem) {

        let bg = {
            background: elem.css('background')
        };

        if (!bg.background) {
            let style = window.getComputedStyle(elem[0]);
            for (key in style)
                if (key.startsWith('background-'))
                    bg[key] = style[key];
			bg['background-position'] = undefined; // redundant with -x and -y.
        }

        return bg;

    }

    // Set topbar themed option. True uses chat theme, false uses default theme, null
    // or undefined loads the persistent setting. Saves setting persistently. Returns
    // the value of the option.
    function setThemed (themed) {

        themed = loadOrStore('themed', themed, false);

        let topbar = $('.topbar');
        if (topbar.length > 0) {

            // First time through, store defaults.
            if (topbar.data('original-background') === undefined)
                topbar.data('original-background', getBackground(topbar));

            // Take background from bottom area.
            if (themed) {
                let bg = getBackground($('#input-area'));
                bg['background-position-y'] = 'bottom'; // Nicer on sites like RPG.
                topbar.css(bg);
            } else {
                topbar.css(topbar.data('original-background'));
            }

        }

        setBrightness();

        return themed;

    }

    // Set topbar element brightness. 1.0 is no change. Null or undefined loads the
    // persistent setting. Saves setting persistently. Brightness is *per-room* and
    // only has an effect when theme is enabled. Returns the value of the option.
    function setBrightness (brightness) {

        // Brightness is per-theme. Makes more sense than per-room.
        let bgkey = /url\(['"]?([^'"]*)/.exec($('#input-area').css('background-image'));
        bgkey = (bgkey && bgkey[1]) ||
                $('#input-area').css('background-color') || // fall back on bg color
                `${window.location.host}-${CHAT.CURRENT_ROOM_ID}`; // then on room id
        bgkey = bgkey.replace(/^https?:\/\//, '');
        let key = `brightness-${bgkey}`;

        // 1.08+ uses bg image as key instead of chat room. Make a modest attempt to
        // preserve the user's current settings by using any brightness that may have
        // been previously set for this room as the default if none is set, and cleaning
        // up old keys.
        let oldkey = `brightness-${window.location.host}-${CHAT.CURRENT_ROOM_ID}`;
        let oldbrightness = load(oldkey, null);
        if (key !== oldkey && oldbrightness !== null) {
            if (load(key, null) === null) {
                store(key, oldbrightness);
                log(`Migrated old brightness setting ${oldkey} => ${key} (${oldbrightness})`);
            }
            try { forgetSetting(oldkey); } catch (e) { console.error(e); }
            log(`Removed obsolete brightness setting ${oldkey}`);
        }

        brightness = loadOrStore(key, brightness, 1.0);

        let themed = load('themed', false);
        $('.network-items > .topbar-icon, .topbar-menu-links > a').css('filter', `brightness(${themed ? brightness : 1.0})`);

        return brightness;

    }

    // Set quiet mode option. Default is false. Null or undefined loads the persistent
    // setting. Saves setting persistently. Returns the value of the option.
    function setQuiet (quiet) {

        return loadOrStore('quiet', quiet, false);

    }

    // Set whether or not chat server links are added to SE dropdown. Default is true.
    // Null or undefined loads the persistent settings. Saves settings persistently.
    // Returns the value of the option.
    function setShowSwitcher (show) {

        show = loadOrStore('showSwitcher', show, true);
        $('.ctb-chat-switcher').toggle(show);
        return show;

    }

    // Set rejoin option. If true then switching chat servers via 'switch' links in the
    // SE dropdown will automatically rejoin favorite rooms, otherwise they'll just go
    // to the main room list page. Default is true. Null or undefined loads the persistent
    // setting. Saves setting persistently. Returns the value of the option.
    function setRejoinOnSwitch (rejoin) {

        rejoin = loadOrStore('rejoin', rejoin, true);

        $('.ctb-chat-switch').each(function (_, link) {
            link = $(link);
            link.attr('href', rejoin ? `//${link.data('ctb-host')}/chats/join/favorite?ctbjoin` : `//${link.data('ctb-host')}`);
        });

        return rejoin;

    }

    // Set whether or not rooms chosen from the room finder load in this frame or a
    // new tab. Default is true (this frame). Null or undefined loads the persistent
    // setting. Saves setting persistently. Returns the value of the option.
    function setOpenRoomsHere (open, noop) {

        open = loadOrStore('openRoomsHere', open, true);

        if (!noop) {
            if (open)
                $('.mc-result-link').attr('target', '_top');
            else
                $('.mc-result-link').removeAttr('target');
        }

        return open;

    }

    // Set whether room search happens as you type, or requires you to press a button.
    // True for as you type, false for button. Default is true. Null or undefined
    // loads the persistent setting. Saves setting persistently. Returns the value
    // of the option.
    function setAutoSearch (auto) {

        auto = loadOrStore('autoSearch', auto, true);

        $('#mc-roomfinder-go').toggle(!auto);
        $('#mc-roomfinder-filter').data('mc-auto', auto);

        return auto;

    }

    // Set whether to sort room search results by activity instead of by people. Default
    // is false (people). Null or undefined loads the persistent setting. Saves setting
    // persistently. Returns the value of the option.
    function setSearchByActivity (byactivity) {

        byactivity = loadOrStore('searchByActivity', byactivity, false);

        // For compact mode, determines which bit of info is displayed.
        $('.topbar').attr('data-mc-result-sort', byactivity ? 'activity' : 'users');

        return byactivity;

    }

    // Set whether or not to convert URLs in room descriptions in the room finder to
    // clickable links. Default is true. Null or undefined loads the persistent setting.
    // Saves setting persistently. Returns the value of the option.
    function setLinkifyDescriptions (enabled) {

        return loadOrStore('linkifyDescriptions', enabled, true);

    }

    // Set whether or not favicons are visible in the room search list. Default is
    // true. Null or undefined loads the persistent setting. Saves setting persistently.
    // Returns the value of the setting.
    function setFaviconVisible (visible) {

        visible = loadOrStore(`faviconVisible-${window.location.hostname}`, visible, true);

        if (visible)
            $('.topbar').addClass('mc-favicon-visible');
        else
            $('.topbar').removeClass('mc-favicon-visible');

        return visible;

    }

    // Set the favicon style in the room search list. Valid values are 'right', 'left',
    // or 'margin'. Default is 'margin'. Null or undefined loads the persistent
    // setting. Saves setting persistently. Returns the value of the option.
    function setFaviconStyle (style) {

        style = loadOrStore('faviconStyle', style, 'margin');

        $('.topbar').attr('data-mc-favicon-style', style);

        return style;

    }

    // Set whether or not to show chat room search results in "compact" mode. Default is
    // false. Null or undefined loads the persistent setting. Saves setting persistently.
    // Returns the value of the option.
    function setCompactResults (compact) {

        compact = loadOrStore('compactResults', compact, false);

        if (compact)
            $('.topbar').addClass('mc-compact-finder');
        else
            $('.topbar').removeClass('mc-compact-finder');

        return compact;

    }

    // Set whether or not to automatically load more room search results when the user has
    // scrolled to the bottom of the result list. Default is false. Null or undefined
    // loads the persistent setting. Saves setting persistently. Returns the value of the
    // option.
    function setAutoLoadMore (auto) {

        return loadOrStore('autoLoadResults', auto, false);

    }

    // Set whether or not search filter is restored after visiting a room through the room
    // search result list. Default is true. Null or undefined loads the persistent setting.
    // Saves setting persistently. Returns the value of the option.
    function setPreserveSearch (preserve) {

        return loadOrStore('preserveSearchParams', preserve, true);

    }

    // Set whether or not the topbar loads in an iframe. Default is false. Null or
    // undefined loads the persistent setting. Saves setting persistently. Returns the
    // value of the option.
    function setRunInFrame (run) {

        return loadOrStore('runInFrame', run, false);

    }

    // Preserve search results. I wanted something short-lived, tab-scoped, and persistent
    // across a page reload, so this uses window.name. It will only work if window.name is
    // empty going in, to reduce the chance of interfering with other people's scripts that
    // may be using it for other things.
    function preserveSearchParams (params) {

        if (setOpenRoomsHere(undefined, true) && setPreserveSearch()) {
            if (window.name) {
                log('Not preserving search params, window.name appears occupied.');
            } else {
                window.name = JSON.stringify({
                    magic: tbData.uid,
                    tab: params.tab,
                    filter: params.filter
                });
            }
        }

    }

    // Restore (and clear) preserved search results, if any.
    function restoreSearchParams () {

        try {
            let params = JSON.parse(window.name);
            if (params.magic === tbData.uid) { // Make sure its ours and not some other script.
                window.name = '';
                delete params.magic;
                log(`Found preserved search params: ${JSON.stringify(params)}`);
                return params;
            }
        } catch (e) {
        }

        return null;

    }

    // Set notification counts, for style debugging.
    function fakeUnreadCounts (inbox, rep) {
        frame[0].contentWindow.StackExchange.topbar.handleRealtimeMessage(JSON.stringify({
            'Inbox': { 'UnreadInboxCount': inbox },
            'Achievements': { 'UnreadRepCount': rep }
        }));
    }

    // Print all settings to console, for debugging.
    function dumpSettings () {
        for (let key of Object.keys(tbData.settings).sort())
            console.log(`${key} => ${load(key)}`);
    }

    // Reset all settings.
    function forgetEverything (noreload) {
        for (let key of Object.keys(tbData.settings).sort())
            forgetSetting(key);
        if (!noreload)
            document.location.reload();
    }

    // Reset one setting.
    function forgetSetting (key) {
        delete tbData.settings[key];
        window.dispatchEvent(new CustomEvent(`deletevalue-${tbData.uid}`, {detail: {key: key}}));
    }

    // Helper for managing default settings. If value is undefined then the stored
    // value or a default is returned, otherwise the value is stored and returned.
    function loadOrStore (key, value, def) {
        if (value === null || value === undefined)
            value = load(key, def);
        else
            store(key, value);
        return value;
    }

    // Helper for GM_setValue (indirect since 1.10 for FF support).
    function store (key, value) {
        tbData.settings[key] = value;
        window.dispatchEvent(new CustomEvent(`setvalue-${tbData.uid}`, {detail: {key: key, value: value}}));
    }

    // Helper for GM_getValue (indirect since 1.10 for FF support).
    function load (key, def) {
        if (typeof tbData.settings[key] === 'undefined')
            return def;
        else
            return tbData.settings[key];
    }

    // Helper for console.log.
    function log (msg, important) {
        if (important || !setQuiet())
            console.log(`Chat Top Bar: ${msg}`);
    }

    // Convert URLs to links. Source: https://stackoverflow.com/a/7123542, works well enough.
    function linkify (str) {
        // http://, https://, ftp://
        var urlPattern = /\b(?:https?|ftp):\/\/[a-z0-9-+&@#\/%?=~_|!:,.;]*[a-z0-9-+&@#\/%=~_|]/gim;
        // www. sans http:// or https://
        var pseudoUrlPattern = /(^|[^\/])(www\.[\S]+(\b|$))/gim;
        // Email addresses
        var emailAddressPattern = /[\w.]+@[a-zA-Z_-]+?(?:\.[a-zA-Z]{2,6})+/gim;
        return str
            .replace(urlPattern, '<a href="$&">$&</a>')
            .replace(pseudoUrlPattern, '$1<a href="http://$2">$2</a>')
            .replace(emailAddressPattern, '<a href="mailto:$&">$&</a>');
    }

    //==============================================================================================

    const CHANGE_LOG_HTML = `
        <ul id="ctb-changes-list">
        <li class="ctb-version-item">1.14.1<li><ul>
        <li>Fixed a minor style issue (no visible change).
        <li>Restore all settings back to proper types instead of strings (your settings should not
            be affected, but apologies in advance if they are).
        <li>Slightly more graceful handling of errors when visiting a chat room while not logged in.</ul>
        <li class="ctb-version-item">1.14<li><ul>
        <li>New "compact" view for room search results (check it out in settings).
        <li>Search params are now preserved across room changes when room is visited from result list
            and "open search result rooms in this tab" is enabled. (Can be disabled with
            <span>ChatTopBar.setPreserveSearch(false)</span>, no option in settings dialog.)
        <li>Title of current room is bold in room search.
        <li>Default site icon position changed to 'margin'. Previous default was 'left', you'll
            have to explicitly pick it if you wish to return to it (sorry).
        <li>Option to automatically load more results when scrolling to bottom of room search list.
            It's experimental and can only be enabled via console (<span>ChatTopBar.setAutoLoadMore(true)</span>).
        <li>Room search server errors no longer break the search dropdown.
        <li>Topbar source iframe was continuously generating a lot of background XHR noise, since
            it was / and would periodically refresh room/event/user lists, etc. Now loads /faq
            instead, which prevents loads of unnecessary requests.
        <li><span>ChatTopBar.setCompactResults</span> to support compact mode option.
        <li>Misc. code and source comment tweaks.</ul>
        <li class="ctb-version-item">1.13<li><ul>
        <li>Site icons are now displayed in room results. Three options for positioning are present in settings dialog (I could not decide).
        <li>The site icon <i>visibility</i> setting is per chat server. Seems reasonable given that MSE and SO rooms all have the same boring icons, while SE is very exciting.
        <li><span>ChatTopBar.setFaviconVisible</span> and <span>ChatTopBar.setFaviconStyle</span> to change icon settings.
        <li>Window event names made more unique to avoid future namespace collisions.</ul>
        <li class="ctb-version-item">1.12.3<li><ul>
        <li>Entire area of room search results is now clickable.
        <li>Option to linkify URLs in room search results (enabled by default).
        <li>Links in room search results are now underlined on hover, to make it clear what you're clicking on.
        <li><span>ChatTopBar.setLinkifyDescriptions</span> to change linkify option.
        <li>Add workaround for <a href="https://meta.stackexchange.com/q/297021/230261">chat highlighting style bug</a>.</ul>
        <li class="ctb-version-item">1.12.2<li><ul>
        <li>Fixed an issue introduced with Firefox support where topbar sometimes didn't load on Chrome.</ul>
        <li class="ctb-version-item">1.12<li><ul>
        <li>Integrated Shog9's awesome Firefox patch. Now works on Firefox!
        <li>Patch also lets it work on internal company chat rooms (which have an extra iframe).
        <li>Chat theme code updated to work on Firefox.</ul>
        <li class="ctb-version-item">1.11.3<li><ul>
        <li>Room dropdown button brightness fixed to match other buttons.
        <li>Also, theme brightness was being applied twice to that button.</ul>
        <li class="ctb-version-item">1.11.2<li><ul>
        <li>Fix match patterns to not run on room info pages.
        <li>Make flag icon (blue notifications on right) disappear on click.
        <li>Scrolling to replies no longer hides them under the topbar.
        <li>Overscrolling on change log no longer scrolls chat.
        <li>Overscrolling on room search results no longer scrolls chat.</ul>
        <li class="ctb-version-item">1.11.1<li><ul>
        <li>Topbar icon hover fixed (thanks Shog9!)
        <li>Update flasher notification now ignores revision number updates.</ul>
        <li class="ctb-version-item">1.11<li><ul>
        <li>Chat room search contains selector for room tab (all, mine, favorites).
        <li>Default search sort order is now by people, with option to use activity instead.
        <li><span>ChatTopBar.setSearchByActivity</span> to change sort order option.</ul>
        <li class="ctb-version-item">1.10<li><ul>
        <li>Search for chat rooms from the top bar! Click the chat icon near the left. Supports search-as-you-type (can be disabled), and optionally
        lets you open rooms in the current tab. Try it! Check settings dialog for new options.
        <li><span>ChatTopBar</span> new functions for search options.
        <li>Cleaner list styling in the change log dialog.</ul>
        <li class="ctb-version-item">1.09<li><ul>
        <li>Clicking site search box in SE dropdown no longer closes dropdown.
        <li>Also, search box didn't work, anyways. Now it does.
        <li>Mousewheel over-scrolling on topbar dropdowns no longer scrolls chat.</ul>
        <li class="ctb-version-item">1.08<li><ul>
        <li>Chat server links placed in SE dropdown (click name to open in new tab, "switch" to open in current tab).
        <li>Clicking "switch" on chat server link automatically rejoins favorite rooms (can be disabled in settings).
        <li>Brightness setting is now associated with the current room's theme rather than the room itself (so it applies to all rooms with the same theme).
        Apologies for any reset settings (it does make a good attempt to copy them, though).
        <li>Change log now displayed after update (when flashing "topbar" link clicked).
        <li><span>ChatTopBar.showChangeLog()</span> will always show the change log, too.
        <li><span>ChatTopBar</span> functions for additional settings added.
        <li>Don't load jQuery UI if it's already loaded.
        <li>Don't run in iframes (by default), for compatibility with some other scripts. <span>ChatTopBar.setRunInFrame()</span> can control this.
        <li>Don't run in mobile chat layout, for compatibility with some other scripts..</ul>
        <li class="ctb-version-item">1.07<li><ul>
        <li>Settings dialog (accessible from "topbar" link in footer).
        <li>Wide mode now matches right side padding instead of fixed at 95%.
        <li>More descriptive search box placeholders.
        <li><span>ChatTopBar.forgetEverything</span>, for testing.</ul>
        <li class="ctb-version-item">1.06<li><ul>
        <li>Brightness now only applied if theme enabled.
        <li>Sidebar resized so it doesn't hide behind the bottom panel.
        <li><span>ChatTopBar.fakeUnreadCounts(inbox,rep)</span> for debugging.
        <li>Explicit <span>unsafeWindow</span> grant.
        <li>Sort output of <span>dumpSettings()</span>.</ul>
        <li class="ctb-version-item">1.05<li><ul>
        <li>Per-room icon/text brightness option.
        <li>Option to suppress console output.
        <li>Ability to dump settings to console for testing.
        <li>Fixed a style bug where things were happening before CSS was loaded, was sometimes causing non-themed topbar to have a white background instead of black.</ul>
        <li class="ctb-version-item">1.03<li><ul>
        <li><span>ChatTopBar</span> console interface for setting options.
        <li>Widen / theme options now user-settable.
        <li>Ability to forget cached account ID for testing.</ul>
        <li class="ctb-version-item">1.02<li><ul>
        <li>WebSocket reconnect when connection lost.
        <li>Beta code for themed topbar.
        <li>Better console logging.</ul>
        <li class="ctb-version-item">1.01<li><ul>
        <li>Realtime event handling via websocket.</ul>
        <li class="ctb-version-item">1.00<li><ul>
        <li>Initial version.</ul>
        </ul>`;

}

    // 1.10 changed all settings values to strings, which also inadvertently
    // reset everybody's settings. 1.14.1 changes back to correct types, but
    // this time we'll migrate settings properly so nobody gets reset. Note:
    // this function is not in MakeTopBar and is not part of the injected
    // script.
    function migrateSettings () {

        try {
            for (let key of GM_listValues()) {
                try {
                    if (key.startsWith('fkey-') || key === 'changesViewedFor') { // Already strings
                        continue;
                    } else if (key.startsWith('brightness-') || key === 'account') { // These are numbers
                        let setting = GM_getValue(key, null);
                        if (setting !== null && typeof setting === 'string') {
                            console.log(`Chat Top Bar: Migrated ${key} (${typeof setting}) => number (${setting})`);
                            GM_setValue(key, Number(setting));
                        }
                    } else { // Rest are booleans or the occasional string
                        let setting = GM_getValue(key, null);
                        if (setting === 'true') {
                            console.log(`Chat Top Bar: Migrated ${key} (${typeof setting}) => boolean (${setting})`);
                            GM_setValue(key, true);
                        } else if (setting === 'false') {
                            console.log(`Chat Top Bar: Migrated ${key} (${typeof setting}) => boolean (${setting})`);
                            GM_setValue(key, false);
                        }
                    }
                } catch (e) {
                    console.error(e);
                }
            }
        } catch (x) {
            console.error(x);
        }

    }

})();
