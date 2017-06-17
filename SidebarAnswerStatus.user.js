// ==UserScript==
// @name         Sidebar Answer Status
// @namespace    https://stackexchange.com/users/305991/jason-c
// @version      1.10-dev3
// @description  Show answer status of questions in sidebar.
// @author       Jason C
// @include      /^https?:\/\/([^/]*\.)?stackoverflow.com/questions/\d.*$/
// @include      /^https?:\/\/([^/]*\.)?serverfault.com/questions/\d.*$/
// @include      /^https?:\/\/([^/]*\.)?superuser.com/questions/\d.*$/
// @include      /^https?:\/\/([^/]*\.)?stackexchange.com/questions/\d.*$/
// @include      /^https?:\/\/([^/]*\.)?askubuntu.com/questions/\d.*$/
// @include      /^https?:\/\/([^/]*\.)?stackapps.com/questions/\d.*$/
// @include      /^https?:\/\/([^/]*\.)?mathoverflow\.net/questions/\d.*$/
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_listValues
// @grant        GM_deleteValue
// @grant        unsafeWindow
// @run-at       document-idle
// @require      https://ajax.googleapis.com/ajax/libs/jquery/1.12.4/jquery.min.js
// ==/UserScript==

(function() {
    'use strict';

    // Used by cacheLoad() and cacheStore().
    const cacheCurrentTime = Date.now();

    // Stuff we store persistently, like stats.
    var persist = objectLoad('persist', {});
    persist.api_avoided = persist.api_avoided || 0;
    persist.api_success = persist.api_success || 0;
    persist.api_total = persist.api_total || 0;
    persist.api_cachedthis = false;
    persist.opt_expire = persist.opt_expire || 30 * 60 * 1000; // 30 minutes

    // Do everything. Error handling is for the birds.
    getSidebarQuestions()
      .then(getAnswerStatus)
      .then(showIfAnswered)
      .always(cacheExpire)
      .always(finalize);

    /* Get sidebar question data. Returns a promise. Data is:
     *
     *    { questions: A set of empty objects keyed by ID,
     *      items: An array of items }
     *
     * Each item is:
     *
     *    { id: question id,
     *      votes: the score dom element,
     *      link: the question link dom element,
     *      title: the question title dom element }
     */
    function getSidebarQuestions () {

        var qs = {
            questions: {},
            items: []
        };

        $('div.linked div.answer-votes, div.related div.answer-votes').each(function (_, obj) {
            var url = $(obj).parent().attr('href');
            var qid = /\/q\/([0-9]*)/.exec(url);
            if (qid) {
                qs.questions[qid[1]] = {};
                qs.items.push({
                    id: qid[1],
                    votes: $(obj),
                    link: $(obj).parent(),
                    title: $(obj).parent().next('.question-hyperlink')
                });
            }
        });

        return $.when(qs);

    }

    /* Fill in sidebar question data with answer status from the API. Returns
     * a promise. Each element in 'questions' will have an additional 'status'
     * property whose value is the corresponding item from the SE API, containing
     * at least:
     *
     *   { is_answered: boolean,
     *     answer_count: number of answers,
     *     up_vote_count: number of upvotes,
     *     down_vote_count: number of downvotes,
     *     question_id: id of the question }
     */
    function getAnswerStatus (qs) {

        var site = document.location.host;

        // if (allcached) also handles the case where there's no items found, but
        // do this first just so we don't also tabulate stats.
        if (qs.items.length === 0)
            return $.when(qs);

        var uncached = {}; // will hold a set of ids need to be queried from API.
        for (let qid in qs.questions)
            if ((qs.questions[qid].status = cacheLoad(`${site}/${qid}`, persist.opt_expire)) === null)
                uncached[qid] = true;
        var allcached = $.isEmptyObject(uncached);

        // if no items on this page need queried, we can avoid the API call.
        persist.api_total ++;
        if (allcached) {
            persist.api_avoided ++;
            persist.api_cachedthis = true;
            return $.when(qs);
        }

        var ids = Object.keys(uncached).join(';');
        var url = `//api.stackexchange.com/2.2/questions/${ids}?pagesize=100&order=desc&sort=activity&site=${site}&filter=!L_Zlzgf-plnNHQRH1DMltE`;

        return $.getJSON(url).then(function (r) {
            persist.api_success ++;
            persist.api_quota = r.quota_remaining;
            for (let item of r.items) {
                qs.questions[item.question_id].status = item;
                cacheStore(`${site}/${item.question_id}`, item);
            }
            return qs;
        });

    }

    /* Update page elements based on answer status. Returns a fulfilled promise.
     */
    function showIfAnswered (qs) {

        for (var q of Object.values(qs.items)) {
            var status = qs.questions[q.id].status;
            if (status.is_answered) // change to status.answer_count > 0 if you'd prefer.
                q.votes.css('border', `1px solid rgba(0,0,0,0.5)`);
            if (status.answer_count === 0)
                q.title.css('font-style', 'italic');
            q.link.attr('title', `${status.is_answered?'A':'Una'}nswered (${status.answer_count}), +${status.up_vote_count} / -${status.down_vote_count}`);
        }

        return $.when();

    }

    /* Called at very end, stores persist and prints a message with some stats.
     */
    function finalize (e) {

        objectStore('persist', persist);

        var s = persist.api_avoided;
        var a = persist.api_success;
        var f = persist.api_total - (persist.api_avoided + persist.api_success);
        var c = persist.api_cachedthis;
        var q = persist.api_quota;
        console.log(`Sidebar Answer Status: ${c?'Cached':'API'} (Cached=${s}, Queried=${a}, Failed=${f}, Quota=${q})`);

        if (e && e.status && (e.status < 200 || e.status >= 300)) {
            var msg = (e.responseJSON && e.responseJSON.error_message) || e.statusText;
            StackExchange.helpers.showBannerMessage(`<b>Sidebar Answer Status: ${msg}</b>`, 'error');
        } else if (!c) {
            if (q <= 0)
                StackExchange.helpers.showBannerMessage(`<b>Sidebar Answer Status: Your API quota is gone for today!</b>`, 'error');
            else if (q <= 10)
                StackExchange.helpers.showBannerMessage(`<b>Sidebar Answer Status: Your API quota is almost gone (${q} remaining)!</b>`, 'error');
            else if (q <= 50)
                StackExchange.helpers.showBannerMessage(`<b>Sidebar Answer Status: Your API quota is getting low (${q} remaining)!</b>`, 'warning');
        }

    }

    /* Save an object to persistent storage. The object must not have a property
     * named 'created', otherwise it might conflict with the question cache. Try
     * not to pick a conflicting key name, either.
     */
    function objectStore (key, obj) {

        try {
            GM_setValue(key, JSON.stringify(obj));
        } catch (e) {
            console.error(e);
        }

    }

    /* Load an object from persistent storage, return def if it's not there. Try
     * not to pick a key that conflicts with the question cache.
     */
    function objectLoad (key, def) {

        var obj = null;

        try {
            obj = JSON.parse(GM_getValue(key, null));
        } catch (e) {
            console.error(e);
        }

        return (obj === null) ? def : obj;

    }

    /* Store an object in the cache. The creation timestamp will be saved, expiration
     * is checked on load.
     */
    function cacheStore (key, item) {

        try {
            var entry = {
                item: item,
                created: cacheCurrentTime
            };
            GM_setValue(key, JSON.stringify(entry));
        } catch (e) {
            console.error(e);
        }

    }

    /* Load an object from the cache. Will return null if item is not in
     * the cache (or has expired). Deletes expired items from the cache.
     * Expiration time must be in milliseconds.
     */
    function cacheLoad (key, expireTime) {

        var item = null;

        try {
            var entry = JSON.parse(GM_getValue(key, null));
            if (entry && entry.created) {
                if (cacheCurrentTime >= (entry.created + expireTime))
                    GM_deleteValue(key);
                else
                    item = entry.item;
            }
        } catch (e) {
            console.error(e);
        }

        return item;

    }

    /* Clean up all expired items in the cache.
     */
    function cacheExpire () {

        try {
            // get stable list of keys first since we may be removing as we go.
            var keys = [];
            for (let key of GM_listValues())
                keys.push(key);
            for (let key of keys)
                cacheLoad(key, persist.opt_expire); // deletes expired objects as a side-effect.
        } catch (e) {
            console.error(e);
        }

    }

    //-----------------------------------------------------------------------------------------
    // Console interface. Overly complicated because Firefox.
    //-----------------------------------------------------------------------------------------

    const NAMESPACE_UID = '7b5e065c-7460-4d8e-9912-729eb855466f';

    function setupConsoleInterface (uid) {
        window.SidebarAnswerStatus = {
            setCacheExpireSeconds: function (seconds) {
                window.dispatchEvent(new CustomEvent(`setCacheExpireSeconds-${uid}`, { detail: { seconds: seconds }}));
            },
            resetStats: function () {
                window.dispatchEvent(new CustomEvent(`resetStats-${uid}`));
            },
            resetAll: function () {
                window.dispatchEvent(new CustomEvent(`resetAll-${uid}`));
            },
            dumpInfo: function () {
                window.dispatchEvent(new CustomEvent(`dumpInfo-${uid}`));
            }
        };
    }

    let script = document.createElement('script');
    script.type = 'text/javascript';
    script.textContent = `(${setupConsoleInterface.toString()})(${JSON.stringify(NAMESPACE_UID)})`;
    document.body.appendChild(script);

    /* Set cache expiration time. */
    window.addEventListener(`setCacheExpireSeconds-${NAMESPACE_UID}`, function (ev) {
        persist.opt_expire = ev.detail.seconds * 1000;
        objectStore('persist', persist);
    });

    /* Reset statistics. */
    window.addEventListener(`resetStats-${NAMESPACE_UID}`, function (ev) {
        persist.api_avoided = 0;
        persist.api_success = 0;
        persist.api_total = 0;
        objectStore('persist', persist);
    });

    /* Delete all persistent data, restoring to "factory" conditions. Provided to allow
     * easier testing through console.
     */
    window.addEventListener(`resetAll-${NAMESPACE_UID}`, function (ev) {

        var keys = [];
        for (let key of GM_listValues())
            keys.push(key);
        for (let key of keys) {
            try {
                console.log(`Removing: ${key} => ${JSON.stringify(GM_getValue(key))}`);
                GM_deleteValue(key);
            } catch (e) {
                console.error(e);
            }
        }

    });

    /** Dump some info to the console for testing.
     */
    window.addEventListener(`dumpInfo-${NAMESPACE_UID}`, function (ev) {

        var cache = 0, other = 0;

        console.log('Cache:');
        for (let key of GM_listValues()) {
            try {
                let value = JSON.parse(GM_getValue(key));
                if (value.created) {
                    cache ++;
                    console.log(`${key} => ${JSON.stringify(value)}`);
                }
            } catch (e) {
                console.error(e);
            }
        }

        console.log('Other:');
        for (let key of GM_listValues()) {
            try {
                let value = JSON.parse(GM_getValue(key));
                if (!value.created) {
                    other ++;
                    console.log(`${key} => ${JSON.stringify(value)}`);
                }
            } catch (e) {
                console.error(e);
            }
        }

        console.log(`Persistent Storage: Cached=${cache}, Other=${other}`);

    });

})();
