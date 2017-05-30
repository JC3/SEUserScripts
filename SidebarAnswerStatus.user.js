// ==UserScript==
// @name         Sidebar Answer Status
// @namespace    https://stackexchange.com/users/305991/jason-c
// @version      1.04
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
// ==/UserScript==

(function() {
    'use strict';

    // Used by cacheLoad() and cacheStore().
    const cacheCurrentTime = Date.now();
    const cacheExpirationTime = 30 * 60 * 1000; // 30 minutes, in milliseconds

    // Do everything. Error handling is for the birds.
    getSidebarQuestions()
      .then(getAnswerStatus)
      .then(showIfAnswered)
      .always(cacheExpire); // Cache cleanup last so it doesn't slow load time.

    /* Get sidebar question data. Returns a promise. Data is:
     *
     *    { questions: A set of empty objects keyed by ID,
     *      items: An array of items }
     *
     * Each item is:
     *
     *    { id: question id,
     *      votes: the score dom element,
     *      link: the question link dom element }
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
                    link: $(obj).parent()
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
     *     question_id: id of the question }
     */
    function getAnswerStatus (qs) {

        var site = document.location.host;

        // if (allcached) also handles the case where there's no items found, but
        // do this first just so we don't also log stats.
        if (qs.items.length === 0)
            return $.when(qs);

        var uncached = {}; // will hold a set of ids need to be queried from API.
        for (let qid in qs.questions)
            if ((qs.questions[qid].status = cacheLoad(`${site}/${qid}`)) === null)
                uncached[qid] = true;
        var allcached = $.isEmptyObject(uncached);

        // this little block is just stats.
        var stats = objectLoad('stats', {a:0,c:0});
        if (allcached)
            stats.c = stats.c + 1;
        else
            stats.a = stats.a + 1;
        objectStore('stats', stats);
        console.log(`Sidebar Answer Status: ${allcached?'Cached':'API'} (API=${stats.a} Cached=${stats.c})`);

        // if no items on this page need queried, we can avoid the API call.
        if (allcached)
            return $.when(qs);

        var ids = Object.keys(uncached).join(';');
        var url = `//api.stackexchange.com/2.2/questions/${ids}?pagesize=100&order=desc&sort=activity&site=${site}&filter=!4(YqyYcHA.0whnoIN`;

        return $.getJSON(url).then(function (r) {
            if (r.quota_remaining < 100)
                console.log(`Sidebar Answer Status: API quota getting low (${r.quota_remaining})`);
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
            if (status.is_answered) { // change to status.answer_count > 0 if you'd prefer.
                q.votes.css('border', `1px solid ${q.votes.css('color')}` /*'1px solid black'*/);
                q.link.attr('title', `Answered (${status.answer_count})`);
            } else {
                q.link.attr('title', `Unanswered (${status.answer_count})`);
            }
        }

        return $.when();

    }

    /* Save an object to persistent storage. The object must not have a property
     * named 'expires', otherwise it might conflict with the question cache. Try
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

    /* Store an object in the cache. The expiration timestamp will be set to
     * cacheCurrentTime + cacheExpirationTime.
     */
    function cacheStore (key, item) {

        try {
            var entry = {
                item: item,
                expires: cacheCurrentTime + cacheExpirationTime
            };
            GM_setValue(key, JSON.stringify(entry));
        } catch (e) {
            console.error(e);
        }

    }

    /* Load an object from the cache. Will return null if item is not in
     * the cache (or has expired). Deletes expired items from the cache.
     */
    function cacheLoad (key) {

        var item = null;

        try {
            var entry = JSON.parse(GM_getValue(key, null));
            if (entry && entry.expires) {
                if (cacheCurrentTime >= entry.expires)
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
                cacheLoad(key); // deletes expired objects as a side-effect.
        } catch (e) {
            console.error(e);
        }

    }

})();
