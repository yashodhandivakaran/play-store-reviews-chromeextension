// Copyright (c) 2014 Nirvana Tikku
//
// A chrome extension utility to scrape the play store reviews.
// Don't judge. This is a simple utility; and there is no guarantee that
// the structure of the reviews will remain intact for long. In fact, I 
// anticipate that this will change somewhat frequently.
//
// As of right now, a PlayStoreReview object looks like ---
// 
// PlayStoreReview = {
//    stars: '',
//    author: '',
//    date: '',
//    time: '',
//    title: '',
//    text: ''
// }
// 
// I know, I know. They're all strings.

//
// PlayStoreReview - the object that contains all the necessary info
// of a review.
//
var PlayStoreReview = function(node){
    var that = this;

    var reviewContainer = node.parentNode.children;

    var reviewData = reviewContainer[0];
    var metaInfo = reviewContainer[1];

    var reviewDataInner = reviewData.children[1];

    this.author = reviewDataInner.firstElementChild.getElementsByTagName('strong')[0].textContent;
    this.date = reviewDataInner.firstElementChild.childNodes[1].textContent.split("at")[0].trim();
    this.time = reviewDataInner.firstElementChild.childNodes[1].textContent.split("at")[1].trim();

    this.stars = reviewDataInner.getElementsByTagName('p')[0].getElementsByTagName('span')[1].getAttribute('title').charAt(0);

    this.title = reviewDataInner.getElementsByTagName('div')[0].getElementsByTagName('pre')[0].firstElementChild.textContent
    this.text = reviewDataInner.getElementsByTagName('div')[0].getElementsByTagName('pre')[0].lastElementChild.textContent

    this.version = metaInfo.firstElementChild.textContent.split(":")[1];
    this.device = metaInfo.lastElementChild.textContent.split(":")[1];

    this.isTheSameAs = function isTheSameAs(review){
        if(review.stars == that.stars &&
            review.author == that.author &&
            review.date == that.date &&
            review.time == that.time){
            return true;
        }
        return false;
    }
    this.toJSON = function toJSON(){
        var ret = {};
        for(var prop in that){
            if(that.hasOwnProperty(prop)){
                var v = that[prop];
                if(typeof(v) !== 'function'){
                    ret[prop] = v;
                }
            }
        }
        return ret;
    }
};

//
// Global Data
//
var PlayerStoreData = {};
PlayerStoreData.reviews = [];

//
//
// As this is a content script, we will load 
// the utilities for scraping the play store.
// The utility will be a browser_action button
// and will load the play store (if not the current window)
// or (1) ask the user for the app to use on the home
// screen; (2) simply scrape the reviews if on the reviews page
//
//
var PlayStoreScraper = {};

//
// Config params
//
var PlayStoreScraperConfig = {
    'delayTimeout': 1500,
    'nextpageDelayTimeout': 2500,
    'playStoreURI': 'play.google.com/apps/publish',
    'reviewExpr': '.N2DAHLD-Xh-c',
    'nextPageText': '▶',
    'reviewsURIFragment': 'ReviewsPlace',
    'homeURIFragment': 'AppListPlace',
    'packageSep': ':p='
};

//
// PlayStoreScraper.init
// Initializes and kicks off the scraper
//
PlayStoreScraper.init = function init(){
    var url = window.location.href;
    if(url.indexOf(PlayStoreScraperConfig.playStoreURI)>-1){
        PlayStoreScraper.go(window, document);
    }
};

//
//
// PlayStoreScraper.getReviews
// Our method to basically cycle through all pages and get the reviews
// 
//
PlayStoreScraper.getReviews = function getReviews(){
    var nextButtonId = PlayStoreScraper.getNextButton();
    if(nextButtonId == null){
        console.log("error: couldn't find next button");
        return;
    }
    var reviews = document.querySelectorAll(PlayStoreScraperConfig.reviewExpr);
    if(reviews.length===0){
        console.log("No reviews found")
        return;
    }

    var review, psr;
    for(var i=0; i<reviews.length; i++){
        review = reviews[i];
        psr = new PlayStoreReview(review);

        //set reviews time limit
        var time_till = Date.parse(date_limit.toString().trim()+':00');
        var review_time_string = psr.time;
        var hours = review_time_string.split(':')[0];
        var minutes = review_time_string.split(':')[1].split(' ')[0];
        var am_pm = review_time_string.split(' ')[1];

        if(am_pm === 'AM' && hours == '12')
        {
            hours = '00';
        }
        else if(am_pm == 'PM' && hours != '12')
        {
            hours = (parseInt(hours)+12).toString();
        }

        if(hours.length == 1)
        {
            hours = '0'+hours;
        }

        var review_date_time = new Date(psr.date+' '+hours+':'+minutes+':00');
        if(review_date_time < time_till)
        {
            PlayStoreScraper.done();
            return;
        }
        //time limit end

        if(PlayerStoreData.reviews.length > 0 &&
            PlayerStoreData.reviews.length > reviews.length &&
            PlayerStoreData.reviews[PlayerStoreData.reviews.length-reviews.length].isTheSameAs(psr)){
            PlayStoreScraper.done();
            return;
        }
        PlayerStoreData.reviews.push(psr);
    }
    PlayStoreScraper.notifyBackground();
    nextButtonId.click();
    setTimeout(PlayStoreScraper.getReviews,PlayStoreScraperConfig.nextpageDelayTimeout);
}

//
// PlayStoreScraper.getNextButton
// A method to find the next button. This is dependent on the design.
//
PlayStoreScraper.getNextButton = function getNextButton(){
    var buttons = document.getElementsByTagName('button');
    var nextButton = null;
    for(var i=0; buttons.length; i++){
        if(buttons[i].textContent.indexOf(PlayStoreScraperConfig.nextPageText)>-1){
            nextButton = buttons[i];
            break;
        }
    }
    return nextButton;
};

//
// PlayStoreScraper.go 
// A method that will guide the user to the reviews scraper
//
PlayStoreScraper.go = function go(win, doc){

    var options = [], opts = [];
    var loc = win.location.href;
    var homeIndex = loc.indexOf('#'+PlayStoreScraperConfig.homeURIFragment);
    var reviewsIndex = loc.indexOf('#'+PlayStoreScraperConfig.reviewsURIFragment);

    // if on the first page... select an app
    if(homeIndex>-1){
        var links = doc.querySelectorAll('a');
        var lnk;
        for(var l=0; l<links.length; l++){
            lnk = links[l];
            if(lnk.href.indexOf(PlayStoreScraperConfig.reviewsURIFragment)>-1){
                var app = lnk.parentNode.parentNode.parentNode.getElementsByTagName('td')[0].textContent;
                options.push({'app':app,'reviewlink':lnk});
                opts.push((opts.length+1)+'.\t'+app);
            }
        }
        var option = 0;
        date_limit = prompt('Enter the time till which we get reviews:eg(July 22,2014 13:20)');
        if(options.length>1){
            option = prompt('Pick one of the following apps to download reviews for:\n'+opts.join('\n'));
        }
        try {
            options[option-1]['reviewlink'].click();
            setTimeout(PlayStoreScraper.getReviews,PlayStoreScraperConfig.delayTimeout);
        } catch (ex) {
            console.log('no app specified...');
        }
    }
    // or if we're already on the reviews page
    else if (reviewsIndex>-1) {
        setTimeout(PlayStoreScraper.getReviews,PlayStoreScraperConfig.delayTimeout);
    }

};

//
// PlayStoreScraper.done
// When done, we will present the user with the reviews.
//
PlayStoreScraper.done = function done(){

    // file name
    var pkg = window.location.href;
    pkg = pkg.substring(pkg.indexOf(PlayStoreScraperConfig.packageSep)+PlayStoreScraperConfig.packageSep.length);
    var d = new Date();
    var ts = (d.getUTCMonth()+1)+'.'+d.getUTCDate()+'.'+d.getUTCFullYear();

    alert("Done gathering "+PlayerStoreData.reviews.length+" reviews. Downloading zip now...");

    var reviewLines = [];

    //rating array
    var five_star ='' ;
    var five_star_count = 1;

    var four_star = '';
    var four_star_count = 1;

    var three_star = '';
    var three_star_count = 1;

    var two_star = '';
    var two_star_count = 1;

    var one_star = '';
    var one_star_count = 1;

    var review_data;
    for(var r=0; r<PlayerStoreData.reviews.length; r++){
        review_data =  PlayerStoreData.reviews[r].toJSON()
        reviewLines.push(review_data);
        switch(review_data.stars)
        {
            case '5':
                five_star = five_star + five_star_count.toString()+") ";
                if(review_data.title.length > 0)
                {
                    five_star = five_star +review_data.title.trim()+" - "
                }
                five_star = five_star + review_data.text.trim()+"\nBy: "+review_data.author.trim()+"\n\n";
                five_star_count++;
                break;
            case '4':
                four_star = four_star + four_star_count.toString()+") ";
                if(review_data.title.length > 0)
                {
                    four_star = four_star +review_data.title.trim()+" - "
                }
                four_star = four_star + review_data.text.trim()+"\nBy: "+review_data.author.trim()+"\n\n";
                four_star_count++;
                break;
            case '3':
                three_star = three_star + three_star_count.toString()+") ";
                if(review_data.title.length > 0)
                {
                    three_star = three_star +review_data.title.trim()+" - "
                }
                three_star = three_star + review_data.text.trim()+"\nBy: "+review_data.author.trim()+"\n\n";
                three_star_count++;
                break;
            case '2':
                two_star = two_star + two_star_count.toString()+") ";
                if(review_data.title.length > 0)
                {
                    two_star = two_star +review_data.title.trim()+" - "
                }
                two_star = two_star + review_data.text.trim()+"\nBy: "+review_data.author.trim()+"\n\n";
                two_star_count++;
                break;
            case '1':
                one_star = one_star + one_star_count.toString()+") ";
                if(review_data.title.length > 0)
                {
                    one_star = one_star +review_data.title.trim()+" - "
                }
                one_star = one_star + review_data.text.trim()+"\nBy: "+review_data.author.trim()+"\n\n";
                one_star_count++;
                break;
        }
    }
    
    //custom output format
    var heading = "1 Star reviews - "+(one_star_count - 1)+"\n"+
        "2 Star reviews - "+(two_star_count - 1)+"\n"+
        "3 Star reviews - "+(three_star_count - 1)+"\n"+
        "4 Star reviews - "+(four_star_count - 1)+"\n"+
        "5 Star reviews - "+(five_star_count - 1)+"\n"+
        "TOTAL - "+(one_star_count+two_star_count+three_star_count+four_star_count+five_star_count - 5)+"\n\n"

    var output = heading+
        "1 Stars\n\n"+one_star+
        "2 Stars\n\n"+two_star+
        "3 Stars\n\n"+three_star+
        "4 Stars\n\n"+four_star+
        "5 Stars\n\n"+five_star;
    // zip up the download
    var zip = new JSZip();
    zip.file('appreviews_'+pkg+'_'+ts+'.txt',output.toString().trim());
    var blob = zip.generate({type:"blob"});

    // download
    window.location.href = window.URL.createObjectURL(blob);

}

PlayStoreScraper.notifyBackground = function notifyBackground(){
    chrome.runtime.sendMessage({numReviews:String(PlayerStoreData.reviews.length)});
}

//
// When the doc is ready, init our PlayStoreScraper.
//
document.onreadystatechange = function() {
    if (document.readyState === 'complete') {
        // setTimeout(PlayStoreScraper.init,2000);
        PlayStoreScraper.notifyBackground();
        chrome.runtime.onMessage.addListener(
            function(request, sender, sendResponse) {
                if (request.numReviews)
                    PlayStoreScraper.notifyBackground();
            });
    }
};
