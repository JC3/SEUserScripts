// ==UserScript==
// @name         Have I Answered?
// @namespace    https://stackexchange.com/users/305991/jason-c
// @version      1.0
// @description  Pop up a message if you've answered a question.
// @author       Jason C
// @include http*://*.stackexchange.com/questions/*
// @include http*://*.stackoverflow.com/questions/*
// @include http*://stackoverflow.com/questions/*
// @include http*://*.superuser.com/questions/*
// @include http*://superuser.com/questions/*
// @include http*://*.serverfault.com/questions/*
// @include http*://serverfault.com/questions/*
// @include http*://*.stackapps.com/questions/*
// @include http*://stackapps.com/questions/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    if (checkIfAnswered())
        StackExchange.helpers.showFancyOverlay({message:'You have already posted an answer to this question.'});

    function checkIfAnswered () {
        var myId = StackExchange.options.user.userId;
        // if user card exists on this page, the we've got an answer.
        if ($(`.answercell .post-signature:last-child .user-details a[href*="/${myId}/"]`).length > 0)
            return true;
        // if there are no more pages of answers, then nothing left to check.
        if ($('.pager-answers').length === 0)
            return false;
        // todo: check api, but for now, just give up...
        return false;
    }

})();
