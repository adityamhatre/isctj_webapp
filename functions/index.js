const functions = require('firebase-functions');
const emailjs = require('emailjs');

exports.getID = functions.database.ref('/clientFiles/{key}/{file}').onWrite(event => {
    function getReviewer() {
        var rCount = 19;
        return new Promise(resolve => {
            var rev = -1;
            var lastUsedReviewerRef = event.data.adminRef.parent.parent.parent.child('last_used_bucket');
            lastUsedReviewerRef.transaction(value => {
                    console.log("GOT LAST USED REVIEWER");
                    console.log("UPDATING LAST USED REVIEWER BY " + 1);
                    rev = (value + 1) % rCount;
                    if (rev == 0) rev = rCount;
                    return rev;
                })
                .then(() => {
                    return resolve(rev);
                });;
        });
    }


    function setFile(newFile) {
        return new Promise(resolve => {
            event.data.ref.set(newFile).then(() => {
                return resolve(true);
            });
        });
    }

    function differenceJSON(before, after) {
        var ret = {};
        if (before == null) return after;
        for (var i in after) {
            if (!before.hasOwnProperty(i)) {
                ret[i] = after[i];
            }
        }
        return ret;
    };

    function dateFormat(date, fstr, utc) {
        utc = utc ? 'getUTC' : 'get';
        return fstr.replace(/%[YmdHMS]/g, function(m) {
            switch (m) {
                case '%Y':
                    return date[utc + 'FullYear'](); // no leading zeros required
                case '%m':
                    m = 1 + date[utc + 'Month']();
                    break;
                case '%d':
                    m = date[utc + 'Date']();
                    break;
                case '%H':
                    m = date[utc + 'Hours']();
                    break;
                case '%M':
                    m = date[utc + 'Minutes']();
                    break;
                case '%S':
                    m = date[utc + 'Seconds']();
                    break;
                default:
                    return m.slice(1); // unknown code, remove %
            }
            // add leading zero if required
            return ('0' + m).slice(-2);
        });
    }

    function getReviewerEmail(reviewerID) {
        return new Promise(resolve => {
            event.data.adminRef.parent.parent.parent.child('reviewers').child("reviewer" + reviewerID).once('value')
                .then(snap => {
                    return resolve(snap.val().email);
                });
        });

    }

    function sendEmail(reviewerID) {

        var email = "";
        var name = "";

        var date = dateFormat(new Date(), "%Y-%m-%d", true);
        var paper_assigned = event.params.file;
        var reviewer = "";

        const newFile = event.data.val();
        const url = "https://storage.cloud.google.com/raid-uploads/";

        const paper_url = url + "uploads/" + newFile.email + "/" + event.params.file.replace(/ /g, "%20") + "/" + newFile.filename.replace(/ /g, "%20");
        const gradeSheetManuscripts_url = url + "uploads/" + newFile.email + "/" + event.params.file.replace(/ /g, "%20") + "/" + newFile.gradeSheetManuscripts.filename.replace(/ /g, "%20");
        const reviewerComments_url = url + "uploads/" + newFile.email + "/" + event.params.file.replace(/ /g, "%20") + "/" + newFile.reviewerComments.filename.replace(/ /g, "%20");

        var htmlString = "" + date + "<br><br>Dear ";

        return event.data.adminRef.parent.parent.parent.child('reviewers').child("reviewer" + reviewerID)
            .once('value')
            .then(snap => {
                email = snap.val().email;
                name = snap.val().name;
                reviewer = name;
                htmlString += reviewer + ", <br><br>";
                htmlString += "Thank you for agreeing to review the paper entitled <b>\"" + paper_assigned + "\"</b> for The International Supply Chain Technology Journal (ISCTJ). I ask that you please try your best to complete your review within the next 2 weeks.<br><br>In your review, please discuss the originality, accuracy and completeness of the work.  I also invite your suggestions for condensing or amplifying the text.  On the review page, there is a space for \"Comments to Editor\" and a space for \"Comments to the Author\". Please be sure to put your comments to the author in the appropriate space.<br><br>For your convenience, the manuscript is attached. Please make your comments on the provided work sheet and send both back to me at either of the email addresses listed below.<br><br>Paper: <a href=\"" + paper_url + "\">" + newFile.filename + "</a><br>Grade Sheet Manuscript: <a href=\"" + gradeSheetManuscripts_url + "\">" + newFile.gradeSheetManuscripts.filename + "</a><br>Reviewer Comments: <a href=\"" + reviewerComments_url + "\">" + newFile.reviewerComments.filename + "</a><br><br>All communications regarding this manuscript are privileged.  Any conflict of interest, suspicion of duplicate publication, fabrication of data or plagiarism must immediately be reported to me.<br><br>Thank you for evaluating this manuscript.<br><br>Sincerely,<br><br>Mr. Joses Jenish Smart<br>Assistant to Editorial Board & Online Journal Production Manager<br>International Supply Chain Technology Journal<br>support@isctjournal.com";
                console.log("Sending to: " + name + " <" + email + ">");
                var server = emailjs.server.connect({
                    user: "system@isctjournal.com",
                    password: "asdfASDF10",
                    host: "smtp.ipower.com",
                    port: 465,
                    ssl: true
                });


                return server.send({
                    text: "Paper assigned is \'" + event.params.file + "\'",
                    from: "ISCTJ System <system@isctjournal.com>",
                    to: name + " <" + email + ">",
                    subject: "Paper assigned",
                    attachment: [
                        { data: htmlString, alternative: true }
                    ]
                }, (err, message) => {
                    console.log(err || message);
                });
            });


    }

    const newFile = event.data.val();
    if (newFile == null || newFile == undefined) return;
    if (newFile.reviewerSet) return;
    if (event.data.previous.val() != null && event.data.previous.val().reviewerSet)
        return event.data.ref.update(event.data.previous.val()); //user re-uploaded same file after rejection

    console.log("-----------------------------------------------------------");
    console.log("STARTING PROCESS");
    console.log(newFile);
    console.log("GETTING LAST USED REVIEWER");
    var reviewer = getReviewer();
    return reviewer.then(reviewerID => {
            console.log("UPDATING FILE");
            newFile.reviewer = reviewerID;
            newFile.reviewerSet = true;
            console.log("FILE UPDATED");
            console.log(newFile);
        })
        .then(() => {
            return getReviewerEmail(newFile.reviewer);
        })
        .then((reviewerEmail) => {
            console.log("UPDATING ACL");
            const Storage = require('@google-cloud/storage');
            const storage = Storage();
            const bucketName = "raid-uploads";

            var aclPromises = [];
            const paper = "uploads/" + newFile.email + "/" + event.params.file + "/" + newFile.filename;
            const gradeSheetManuscripts = "uploads/" + newFile.email + "/" + event.params.file + "/" + newFile.gradeSheetManuscripts.filename;
            const reviewerComments = "uploads/" + newFile.email + "/" + event.params.file + "/" + newFile.reviewerComments.filename;

            console.log("Reviewer assigned for ACL: " + reviewerEmail);
            console.log(paper);
            console.log(gradeSheetManuscripts);
            console.log(reviewerComments);

            aclPromises.push(storage.bucket(bucketName).file(paper).acl.readers.addUser(reviewerEmail));
            aclPromises.push(storage.bucket(bucketName).file(gradeSheetManuscripts).acl.readers.addUser(reviewerEmail));
            aclPromises.push(storage.bucket(bucketName).file(reviewerComments).acl.readers.addUser(reviewerEmail));

            return Promise.all(aclPromises);
        })
        .then(() => {
            console.log("UPDATED ACL");
            console.log("SENDING MAIL");
            return sendEmail(newFile.reviewer);
        })
        .then(() => {
            console.log("SENT MAIL");
            console.log("UPLOADING FILE");
            return event.data.ref.update(newFile);
        })
        .then(() => {
            console.log("FILE UPLOADED");
            console.log("PROCESS END");
            console.log("-----------------------------------------------------------");
        })
        .catch(error => {
            console.log("ERROR OCCURRED")
            console.log(error.code);
            console.log(error.message);
            console.error(error);
        });
});

exports.accepted = functions.database.ref('/acceptedFiles/{key}/{file}').onWrite(event => {
    function getNewDOI() {
        return new Promise(resolve => {
            var rev = -1;
            var lastDOI = event.data.adminRef.parent.parent.parent.child('last_used_doi');
            lastDOI.transaction(value => {
                    console.log(value);
                    if (value == null) {
                        value = "v01.n01.01";
                    }
                    var dois = value.split(".");
                    if (dois[2] == "01") dois[2] = "02";
                    else if (dois[2] == "02") dois[2] = "03";
                    else if (dois[2] == "03") {
                        dois[2] = "01";
                        if (dois[1] == "n01") dois[1] = "n02";
                        else if (dois[1] == "n02") dois[1] = "n03";
                        else if (dois[1] == "n03") dois[1] = "n04";
                        else if (dois[1] == "n04") dois[1] = "n05";
                        else if (dois[1] == "n05") dois[1] = "n06";
                        else if (dois[1] == "n06") dois[1] = "n07";
                        else if (dois[1] == "n07") dois[1] = "n08";
                        else if (dois[1] == "n08") dois[1] = "n09";
                        else if (dois[1] == "n09") dois[1] = "n10";
                        else if (dois[1] == "n10") dois[1] = "n11";
                        else if (dois[1] == "n11") dois[1] = "n12";
                        else if (dois[1] == "n12") dois[1] = "n01";
                    }

                    if (dois[1] == "12") {
                        dois[1] = "01";
                        if (dois[0] == "v01") dois[0] = "v02";
                        else if (dois[0] == "v02") dois[0] = "v03";
                        else if (dois[0] == "v03") dois[0] = "v04";
                        else if (dois[0] == "v04") dois[0] = "v05";
                        else if (dois[0] == "v05") dois[0] = "v06";
                        else if (dois[0] == "v06") dois[0] = "v07";
                        else if (dois[0] == "v07") dois[0] = "v08";
                        else if (dois[0] == "v08") dois[0] = "v09";
                        else if (dois[0] == "v09") dois[0] = "v10";
                        else if (dois[0] == "v10") dois[0] = "v11";
                        else if (dois[0] == "v11") dois[0] = "v12";
                        else if (dois[0] == "v12") dois[0] = "v13";
                    }
                    var final_doi = dois.join(".");
                    rev = final_doi;
                    return final_doi;

                })
                .then(() => {
                    return resolve(rev);
                });;
        });
    }

    const file = event.data.val();
    console.log(file);
    if (!file.mailSent) {
        file.mailSent = true;
        return getNewDOI().then(doi => {
            file.doi = doi;
            return event.data.ref.update(file);
        }).then(() => {
            var server = emailjs.server.connect({
                user: "system@isctjournal.com",
                password: "asdfASDF10",
                host: "smtp.ipower.com",
                port: 465,
                ssl: true
            });
            var htmlString="Congratulations !!!!\nYour paper '" + event.params.file + "' has been accepted and will be shortly available on <a href='http://www.isctjounral.com'>website</a><br><br><b><u>DOI: DOI#: 10.20545/isctj."+file.doi+"</b></u>";
            return server.send({
                text: "Paper assigned is \'" + event.params.file + "\'",
                from: "ISCTJ System <system@isctjournal.com>",
                to: "<" + file.email + ">",
                subject: "Paper accepted",
                attachment: [
                    { data: htmlString, alternative: true }
                ]
            }, (err, message) => {
                console.log(err || message);
            });
        })

    } else return;
});