// ==UserScript==
// @name         Sidebar Answer Status
// @namespace    https://stackexchange.com/users/305991/jason-c
// @version      1.0
// @description  Show answer status of questions in sidebar.
// @author       Jason C
// @match        http*://*.stackexchange.com/questions/*
// @match        http*://*.stackoverflow.com/questions/*
// @match        http*://stackoverflow.com/questions/*
// @match        http*://*.superuser.com/questions/*
// @match        http*://superuser.com/questions/*
// @match        http*://*.serverfault.com/questions/*
// @match        http*://serverfault.com/questions/*
// @match        http*://*.stackapps.com/questions/*
// @match        http*://stackapps.com/questions/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Do everything. Error handling is for the birds.
    getSidebarQuestions()
      .then(getAnswerStatus)
      .then(showIfAnswered);

    /* Get sidebar question data. Returns a promise. Data is an object whose
     * keys are question IDs and whose values are:
     *
     *    { id: question id,
     *      votes: the score dom element,
     *      link: the question link dom element }
     */
    function getSidebarQuestions () {

        var qs = {};

        $('div.linked div.answer-votes, div.related div.answer-votes').each(function (_, obj) {
            var url = $(obj).parent().attr('href');
            var qid = /\/q\/([0-9]*)/.exec(url);
            if (qid) {
                qs[qid[1]] = {
                    id: qid[1],
                    votes: $(obj),
                    link: $(obj).parent()
                };
            }
        });

        return $.when(qs);

    }

    /* Fill in sidebar question data with answer status from the API. Returns
     * a promise. Each element will have an additional 'status' property whose
     * value is the corresponding item from the SE API, containing at least:
     *
     *   { is_answered: boolean,
     *     answer_count: number of answers,
     *     question_id: id of the question }
     */
    function getAnswerStatus (qs) {

        var site = document.location.host;
        var ids = Object.keys(qs).join(';');
        var url = `//api.stackexchange.com/2.2/questions/${ids}?order=desc&sort=activity&site=${site}&filter=!4(YqyYcHA.0whnoIN`;

        return $.getJSON(url).then(function (r) {
            for (var item of r.items)
                qs[item.question_id].status = item;
            return qs;
        });

    }

    /* Update page elements based on answer status. Returns nothing.
     */
    function showIfAnswered (qs) {

        for (var q of Object.values(qs)) {
            if (q.status.is_answered) { // change to q.status.answer_count > 0 if you'd prefer.
                q.votes.css('border', `1px solid ${q.votes.css('color')}` /*'1px solid black'*/);
                q.link.attr('title', `Answered (${q.status.answer_count})`);
            } else {
                q.link.attr('title', `Unanswered (${q.status.answer_count})`);
            }
        }

    }

})();
