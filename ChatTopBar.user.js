// ==UserScript==
// @name         Top bar in chat.
// @namespace    https://stackexchange.com/users/305991/jason-c
// @version      1.11.3
// @description  Add a fully functional top bar to chat windows.
// @author       Jason C
// @include      /^https?:\/\/chat\.meta\.stackexchange\.com\/rooms\/[0-9]+.*$/
// @include      /^https?:\/\/chat\.stackexchange\.com\/rooms\/[0-9]+.*$/
// @include      /^https?:\/\/chat\.stackoverflow\.com\/rooms\/[0-9]+.*$/
// @match        */chats/join/favorite?ctbjoin
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_listValues
// @grant        GM_deleteValue
// @grant        unsafeWindow
// ==/UserScript==

(function() {
    'use strict';

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

    // The main chat server page has a topbar and is on the same domain, load it up
    // in an invisible iframe.
    var frame = $('<iframe/>')
       .css('display', 'none')
       .attr('src', '/')
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
    unsafeWindow.ChatTopBar = {
        setWiden: setWiden,
        setThemed: setThemed,
        setBrightness: setBrightness,
        setQuiet: setQuiet,
        setShowSwitcher: setShowSwitcher,
        setRejoinOnSwitch: setRejoinOnSwitch,
        setOpenRoomsHere: setOpenRoomsHere,
        setAutoSearch: setAutoSearch,
        setSearchByActivity: setSearchByActivity,
        setRunInFrame: setRunInFrame,
        showChangeLog: showChangeLog,
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
            // setShowSwitcher() is initialized in watchSEDropdown().
            // setRejoinOnSwitch() is initialized in watchSEDropdown().

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
                height: `calc(100% - ${topbar.height()}px`
            });
            $(unsafeWindow).trigger('resize'); // Force sidebar resize, guess SE does it dynamically.
            installReplyScrollHandler(topbar.height()); // Also take over scrolling for reply buttons, see comments there.

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

        // Create the dropdown. We can put it in the corral, then as a side-effect it'll
        // get the overscroll fix applied to it as well.
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
        $('<div class="mc-result-container" id="mc-result-more"\>')
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

        // I'm sick of typing .css() everywhere. Style the search results in a stylesheet.
        $('<style type="text/css"/>').text(
            '.mc-result-container { padding: 10px; border-top: 1px solid #eff0f1; line-height: 1.3; }\n' +
            '.mc-result-container:hover { background: #f7f8f8; }\n' +
            '.mc-result-link { }\n' +
            '.mc-result-title { margin-bottom: 4px; }\n' +
            '.mc-result-description { margin-bottom: 4px; color: #2f3337; }\n' +
            '.mc-result-info { color: #848d95; }\n' +
            '.mc-result-users { }\n' +
            '.mc-result-activity { float: right; }\n' +
            '#mc-result-more { color: #999; }\n' +
            '.mc-result-more-link { font-weight: bold; color: #0077cc !important; }\n' +
            '#mc-roomfinder-tab { border: 1px solid #cbcbcb; box-shadow: inset 0 1px 2px #eff0f1,0 0 0 #FFF; color: #2f3337; }\n')
            .prependTo(dropdown);

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
                window.frames[0].StackExchange.topbar.hideAll();
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
        status.removeClass('mc-result-more-link');

        // New search vs. loading more results.
        if (more && res.data('mc-params')) {
            // Update status.
            status.toggle(true).off('click').text('Loading More...');
            // Next page, from data.
            params = res.data('mc-params');
            params.page = (params.page || 1) + 1;
            res.data('mc-params', params);
        } else {
            // Clear existing results and update status.
            status.toggle(true).off('click').text('Loading...');
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
        $.post('/rooms', params).then(function (html) {
            let doc = $('<div/>').html(html);
            doc.find('.roomcard').each(function (_, roomcard) {
                roomcard = $(roomcard);
                let result = {
                    name: roomcard.find('.room-name').text().trim(),
                    description: roomcard.find('.room-description').html().trim(),
                    activity: roomcard.find('.last-activity').html().trim(),
                    users: Number(roomcard.find('.room-users').attr('title').replace(/[^0-9]/g, '')),
                    id: Number(roomcard.attr('id').replace(/[^0-9]/g, ''))
                };
                $('<div class="mc-result-container mc-result-card"\>')
                    .append($(`<a href="//${window.location.hostname}/rooms/${result.id}" class="mc-result-link"/>`)
                        .append($(`<div class="mc-result-title">${escape(result.name)}</div>`))
                        .append($(`<div class="mc-result-description">${result.description}</div>`)))
                    .append($(`<div class="mc-result-info"><span class="mc-result-users">${withs(result.users, 'user')}</span><span class="mc-result-activity">${result.activity}</span></div>`))
                    .appendTo(res);
            });
            if (doc.find('.pager a[rel="next"').length > 0) {
                status
                    .addClass('mc-result-more-link')
                    .toggle(true)
                    .text('Load More...')
                    .click(() => (doRoomSearch(true), false))
                    .appendTo(res);
            } else if (res.find('.mc-result-card').length === 0) {
                status
                    .removeClass('mc-result-more-link')
                    .toggle(true)
                    .text(params.filter === '' ? 'No results.' : `No results for "${params.filter}".`)
                    .off('click');
            } else {
                status.toggle(false);
            }
            setOpenRoomsHere(); // Update target attribute in result links.
        }).fail(function (e) {
            res.text('An error occurred.');
        }).always(function () {
            sinput.prop('disabled', false);
            sbutton.prop('disabled', false);
            stab.prop('disabled', false);
            if (!sinput.data('mc-auto'))
                sinput.focus();
        });

    }

    // Sloppily escape HTML.
    function escape (str) {
        return str.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;');
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
            let title = (typeof GM_info === 'undefined' ? '' : ` (${GM_info.script.version})`);
            $('body').append(
                `<div id="ctb-settings-dialog" title="Settings${title}">` +
                '<label><input type="checkbox" name="themed" onchange="ChatTopBar.setThemed(this.checked)"><span>Use chat room themes</span></label>' +
                '<label><input type="checkbox" name="widen" onchange="ChatTopBar.setWiden(this.checked)"><span>Wide layout</span></label>' +
                '<label><input type="checkbox" name="switch" onchange="ChatTopBar.setShowSwitcher(this.checked)"><span>Show chat servers in SE dropdown</span></label>' +
                '<label><input type="checkbox" name="rejoin" onchange="ChatTopBar.setRejoinOnSwitch(this.checked)"><span>Rejoin favorites on switch</span></label>' +
                '<label><input type="checkbox" name="autosearch" onchange="ChatTopBar.setAutoSearch(this.checked)"><span>Search for rooms as you type</span></label>' +
                '<label><input type="checkbox" name="byactivity" onchange="ChatTopBar.setSearchByActivity(this.checked)"><span>Sort rooms by activity instead of people</span></label>' +
                '<label><input type="checkbox" name="open" onchange="ChatTopBar.setOpenRoomsHere(this.checked)"><span>Open search result rooms in this tab</span></label>' +
                '<label><input type="checkbox" name="quiet" onchange="ChatTopBar.setQuiet(this.checked)"><span>Suppress console output</span></label>' +
                '<hr><label class="ctb-fixheight"><span>Brightness (this theme only):</span></label>' +
                '<div class="ctb-fixheight"><div style="flex-grow:1" id="ctb-settings-brightness"></div></div><hr>' +
                `<div class="ctb-fixheight" style="white-space:nowrap"><a href="${URL_UPDATES}">Updates</a>&nbsp;|&nbsp;<a href="${URL_MORE}">More Scripts</a>&nbsp;|&nbsp;<a href="#" id="ctb-show-log">Change Log</a></div>` +
                '</div>');
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

        if (typeof GM_info === 'undefined')
            return;

        let oldVersion = load('changesViewedFor', null);
        let newVersion = /^([0-9]+\.[0-9]+)/.exec(GM_info.script.version)[1]; // no flashing for minor versions.
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
            let title = (typeof GM_info === 'undefined' ? '' : ` (${GM_info.script.version})`);
            let devmsg = title.includes('dev') ? ' <b>You\'re using a development version, you won\'t receive release updates until you reinstall from the StackApps page again.</b>' : '';
            $('body').append(
                `<div id="ctb-changes-dialog" title="Chat Top Bar Change Log${title}"><div class="ctb-important">For details see <a href="${URL_UPDATES}">the StackApps page</a>!${devmsg}</div><ul id="ctb-changes-list">` +
                '<li class="ctb-version-item">1.11.3<li><ul>' +
                '<li>Room dropdown button brightness fixed to match other buttons.' +
                '<li>Also, theme brightness was being applied twice to that button.</ul>' +
                '<li class="ctb-version-item">1.11.2<li><ul>' +
                '<li>Fix match patterns to not run on room info pages.' +
                '<li>Make flag icon (blue notifications on right) disappear on click.' +
                '<li>Scrolling to replies no longer hides them under the topbar.' +
                '<li>Overscrolling on change log no longer scrolls chat.' +
                '<li>Overscrolling on room search results no longer scrolls chat.</ul>' +
                '<li class="ctb-version-item">1.11.1<li><ul>' +
                '<li>Topbar icon hover fixed (thanks Shog9!)' +
                '<li>Update flasher notification now ignores revision number updates.</ul>' +
                '<li class="ctb-version-item">1.11<li><ul>' +
                '<li>Chat room search contains selector for room tab (all, mine, favorites).' +
                '<li>Default search sort order is now by people, with option to use activity instead.' +
                '<li><span>ChatTopBar.setSearchByActivity</span> to change sort order option.</ul>' +
                '<li class="ctb-version-item">1.10<li><ul>' +
                '<li>Search for chat rooms from the top bar! Click the chat icon near the left. Supports search-as-you-type (can be disabled), and optionally ' +
                'lets you open rooms in the current tab. Try it! Check settings dialog for new options.' +
                '<li><span>ChatTopBar</span> new functions for search options.' +
                '<li>Cleaner list styling in the change log dialog.</ul>' +
                '<li class="ctb-version-item">1.09<li><ul>' +
                '<li>Clicking site search box in SE dropdown no longer closes dropdown.' +
                '<li>Also, search box didn\'t work, anyways. Now it does.' +
                '<li>Mousewheel over-scrolling on topbar dropdowns no longer scrolls chat.</ul>' +
                '<li class="ctb-version-item">1.08<li><ul>' +
                '<li>Chat server links placed in SE dropdown (click name to open in new tab, "switch" to open in current tab).' +
                '<li>Clicking "switch" on chat server link automatically rejoins favorite rooms (can be disabled in settings).' +
                '<li>Brightness setting is now associated with the current room\'s theme rather than the room itself (so it applies to all rooms with the same theme). ' +
                'Apologies for any reset settings (it does make a good attempt to copy them, though).' +
                '<li>Change log now displayed after update (when flashing "topbar" link clicked).' +
                '<li><span>ChatTopBar.showChangeLog()</span> will always show the change log, too.' +
                '<li><span>ChatTopBar</span> functions for additional settings added.' +
                '<li>Don\'t load jQuery UI if it\'s already loaded.' +
                '<li>Don\'t run in iframes (by default), for compatibility with some other scripts. <span>ChatTopBar.setRunInFrame()</span> can control this.' +
                '<li>Don\'t run in mobile chat layout, for compatibility with some other scripts..</ul>' +
                '<li class="ctb-version-item">1.07<li><ul>' +
                '<li>Settings dialog (accessible from "topbar" link in footer).' +
                '<li>Wide mode now matches right side padding instead of fixed at 95%.' +
                '<li>More descriptive search box placeholders.' +
                '<li><span>ChatTopBar.forgetEverything</span>, for testing.</ul>' +
                '<li class="ctb-version-item">1.06<li><ul>' +
                '<li>Brightness now only applied if theme enabled.' +
                '<li>Sidebar resized so it doesn\'t hide behind the bottom panel.' +
                '<li><span>ChatTopBar.fakeUnreadCounts(inbox,rep)</span> for debugging.' +
                '<li>Explicit <span>unsafeWindow</span> grant.' +
                '<li>Sort output of <span>dumpSettings()</span>.</ul>' +
                '<li class="ctb-version-item">1.05<li><ul>' +
                '<li>Per-room icon/text brightness option.' +
                '<li>Option to suppress console output.' +
                '<li>Ability to dump settings to console for testing.' +
                '<li>Fixed a style bug where things were happening before CSS was loaded, was sometimes causing non-themed topbar to have a white background instead of black.</ul>' +
                '<li class="ctb-version-item">1.03<li><ul>' +
                '<li><span>ChatTopBar</span> console interface for setting options.' +
                '<li>Widen / theme options now user-settable.' +
                '<li>Ability to forget cached account ID for testing.</ul>' +
                '<li class="ctb-version-item">1.02<li><ul>' +
                '<li>WebSocket reconnect when connection lost.' +
                '<li>Beta code for themed topbar.' +
                '<li>Better console logging.</ul>' +
                '<li class="ctb-version-item">1.01<li><ul>' +
                '<li>Realtime event handling via websocket.</ul>' +
                '<li class="ctb-version-item">1.00<li><ul>' +
                '<li>Initial version.</ul>' +
                '</ul></div>');
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

    // Set topbar themed option. True uses chat theme, false uses default theme, null
    // or undefined loads the persistent setting. Saves setting persistently. Returns
    // the value of the option.
    function setThemed (themed) {

        themed = loadOrStore('themed', themed, false);

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
            try { GM_deleteValue(oldkey); } catch (e) { console.error(e); }
            log(`Removed obsolete brightness setting ${oldkey}`);
        }

        brightness = loadOrStore(key, brightness, 1.0);

        let themed = load('themed', false);
        $('.network-items > .topbar-icon, .topbar-menu-links').css('filter', `brightness(${themed ? brightness : 1.0})`);

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
    function setOpenRoomsHere (open) {

        open = loadOrStore('openRoomsHere', open, true);

        if (open)
            $('.mc-result-link').attr('target', '_top');
        else
            $('.mc-result-link').removeAttr('target');

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

        return loadOrStore('searchByActivity', byactivity, false);

    }

    // Set whether or not the topbar loads in an iframe. Default is false. Null or
    // undefined loads the persistent setting. Saves setting persistently. Returns the
    // value of the option.
    function setRunInFrame (run) {

        return loadOrStore('runInFrame', run, false);

    }

    // Helper for managing default settings. If value is undefined then a default is
    // returned, otherwise the value is stored and returned.
    function loadOrStore (key, value, def) {

        if (value === null || value === undefined)
            value = load(key, def);
        else
            store(key, value);

        return value;

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
    function log (msg, important) {
        if (important || !setQuiet())
            console.log(`Chat Top Bar: ${msg}`);
    }

})();