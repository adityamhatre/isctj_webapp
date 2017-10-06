require('dotenv').config();
var express = require('express');

var multer = require('multer');
const fs = require('fs-extra');

var mkdirp = require('mkdirp');

var firebase = require('firebase');

var emailjs = require('emailjs');

var router = express.Router();

var dir = "";
var logged_in_user = null;
var mode = null;
var currentResult = null;
var currentRequest = null;
var free_reviewer = null;
var found_reviewer = false;

var Storage = multer.diskStorage({
    destination: function(req, file, callback) {
        callback(null, "./uploads");
    },
    filename: function(req, file, callback) {
        //callback(null, file.fieldname + "_" + Date.now() + "_" + file.originalname);
        callback(null, file.originalname);
    }
});

var upload = multer({
    storage: Storage
}).fields([
    { name: 'paper', maxCount: 1 },
    { name: 'reviewers_comment', maxCount: 1 },
    { name: 'grade_sheet_manuscript', maxCount: 1 }
]); 
var file_array = ['paper', 'reviewers_comment', 'grade_sheet_manuscript'];

var config = {
    apiKey: Buffer.from(process.env.FIREBASE_API_KEY, 'base64').toString(),
    authDomain: "raid-uploads.firebaseapp.com",
    databaseURL: "https://raid-uploads.firebaseio.com",
    projectId: "raid-uploads",
    storageBucket: "gs://raid-uploads.appspot.com",
    messagingSenderId: "712670661649"
};
var firebaseApp = firebase.initializeApp(config);
var database = firebaseApp.database();
var auth = firebaseApp.auth();



function oneTime() {
    var val = [
        { id: 1, name: "Dr. Somasekar Balasubramanian", email: "somasekar.balasubramanian@mavs.uta.edu" },
        { id: 2, name: "Dr. Mario Beruvides", email: "mario.beruvides@ttu.edu" },
        { id: 3, name: "Mrs. Wanda Jackson", email: "wjackson@pwdgroups.com" },
        { id: 4, name: "Dr. Vettrivel Gnaneswaran", email: "vettri@gmail.com" },
        { id: 5, name: "Dr. Andrea Graham", email: "andrea.graham@tamuc.edu" },
        { id: 6, name: "Dr. Billy Gray", email: "bgray@tarleton.edu" },
        { id: 7, name: "Dr. Shalini Gupta", email: "shalinig@usc.edu" },
        { id: 8, name: "Dr. Felicia Jefferson", email: "jeffersonf@fvsu.edu" },
        { id: 9, name: "Dr. Ramakrishna Koganti", email: "rkoganti@uta.edu" },
        { id: 10, name: "Dr. Dejing Kong", email: "nancykong315@hotmail.com" },
        { id: 11, name: "Dr. Shernette Kydd", email: "skydd@uta.edu" },
        { id: 12, name: "Dr. Ida Lumintu", email: "ida.lumintu@gmail.com" },
        { id: 13, name: "Dr. Md. Mamun Habib", email: "mamunhabib@gmail.com" },
        { id: 14, name: "Dr. Beatriz Murrieta Cortésm", email: "bmurriet@itesm.mx" },
        { id: 15, name: "Dr. Samuel Okate", email: "samuel.okate@mavs.uta.edu" },
        { id: 16, name: "Dr. Manbir Sodhi", email: "sodhi@uri.edu" },
        { id: 17, name: "Dr. Lai VingKam", email: "vingkam_lai@hotmail.com" },
        { id: 18, name: "Dr. Dwight L. Mosby", email: "dwight.l.mosby@nasa.gov" },
        { id: 19, name: "Er. Aditya R. Mhatre", email: "aditya.r.mhatre@gmail.com" }
    ];
    var i = 1;
    val.forEach(value => {
        database.ref('reviewers').child(`reviewer${i}`).set(value);
        i++;
    });}


//Handle Account Status
auth.onAuthStateChanged(user => {
    var normalUser = true;
    if (user) {
        logged_in_user = user;
        database.ref('reviewers').once('value').then(snap => {
            snap.forEach(csnap => {
                var reviewer = csnap.val();
                if (user.email == reviewer.email) {
                    normalUser = false;
                    return;
                }

            });
            switch (mode) {
                case 'login':
                    currentRequest.session.normalUser = normalUser;
                    currentRequest.session.loggedIn = true;
                    currentRequest.session.email = user.email;
                    currentResult.status(200).json({
                        status: 'login_success',
                        message: '/'
                    });
                    break;
                case 'register':
                    currentRequest.session.normalUser = normalUser;
                    currentRequest.session.loggedIn = true;
                    currentRequest.session.email = user.email;
                    currentResult.status(200).json({
                        status: 'register_success',
                        message: 'Successfully registered.<br><a href=\'/\'>Login</a>'
                    });
                    break;
            }

        });
        console.log(mode);

    } else logged_in_user = null;
});


var gcloud = require('google-cloud')({
    projectId: 'raid-uploads',
    keyFilename: 'keys/RAID Uploads-9fdff6375618.json'
});
var storage = gcloud.storage();

var bucketName = 'raid-uploads';
var bucket = storage.bucket(bucketName);


router.get('/', function(req, res, next) {
    mode = 'login';
    currentResult = res;
    currentRequest = req;
    res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.header('Expires', '-1');
    res.header('Pragma', 'no-cache');
    res.render('index', { title: 'Home', loggedIn: req.session.loggedIn, email: req.session.email, normalUser: req.session.normalUser });
    req.session.errors = null;


});


router.get('/register', function(req, res, next) {
    mode = 'register';
    currentResult = res;
    currentRequest = req;
    res.render('register', { title: 'Register' });
});

router.get('/review', (req, res, next) => {
    mode = 'review';
    currentResult = res;
    currentRequest = req;
    if (logged_in_user != null) {
        res.render('review', { title: 'Review', email: logged_in_user.email });
    } else {
        res.redirect('/');
    }
});



// Requires logged in.
router.get('/upload', function(req, res, next) {
    currentResult = res;
    currentRequest = req;
    if (logged_in_user != null) {
        res.render('upload', { title: 'Upload', email: logged_in_user.email });
    } else {
        res.redirect('/');
    }
});

router.post('/api/login', function(req, res, next) {
    currentResult = res;
    currentRequest = req;
    var email = req.body.email;
    var password = req.body.password;

    auth.signInWithEmailAndPassword(email, password).catch(function(error) {
        // Handle Errors here.
        var errorCode = error.code;
        var errorMessage = error.message;
        currentRequest.session.loggedIn = false;
        currentRequest.session.email = null;
        res.status(200).json({
            status: 'login_fail',
            message: 'Incorrect username and/or password'
        });
    });
});

router.get('/logout', function(req, res, next) {
    currentResult = res;
    currentRequest = req;
    auth.signOut()
        .then(function() {
            req.session.destroy(function(err) {});
            res.redirect('/');
        }).catch(function(error) {
            log(error);
            var errorCode = error.code;
            var errorMessage = error.message;
        });

});

router.post('/api/register', function(req, res, next) {
    currentResult = res;
    currentRequest = req;

    dir = req.body.email;
    var email = req.body.email;
    var password = req.body.password;

    auth.createUserWithEmailAndPassword(email, password)
        .then(() => {
            mkdirp("./uploads/" + dir, err => {});
        })
        .then(() => {
            bucket.upload("keys/welcome.txt", { destination: "uploads/" + dir + "/.first_file" }, (err, file) => {

            });

        })
        .then(() => {
            log(`Folder ${dir} created`);
        })
        .catch(function(error) {
            var errorCode = error.code;
            var errorMessage = error.message;
            res.status(200).json({
                status: "register_fail",
                message: errorMessage
            });
        });
});


router.post("/api/upload", function(req, res) {
    currentResult = res;
    currentRequest = req;

    upload(req, res, function(err) {
        if (err) {
            return res.end("Something went wrong!");
        }
        if (req.files['paper'] == undefined &&
            req.files['reviewers_comment'] == undefined &&
            req.files['grade_sheet_manuscript'] == undefined) {
            return res.end("Upload all 3 files");
        }

        var newFileName = req.body.paper_name;
        var files = {};
        files[newFileName] = {
            filename: req.files['paper'][0].filename,
            email: req.body.email,
            accepted: false,
            reviewerSet: false,
            mailSent: false,
            reviewerComments: {
                filename: req.files['reviewers_comment'][0].filename
            },
            gradeSheetManuscripts: {
                filename: req.files['grade_sheet_manuscript'][0].filename
            }
        };
        var promises = [];
        
        for (var i = 2; i >= 0; i--) {
                var fileName = req.files[file_array[i]][0].filename;
                log('file uploaded is: ' + fileName);
                dir = req.body.email;

                var localUpload = fs.move('./uploads/' + fileName, './uploads/' + dir + '/' + newFileName + "/" + fileName, { overwrite: true }, err => {
                    if (err) return log(err);
                });

                var cloudUpload = bucket.upload('./uploads/' + fileName, {
                    destination: 'uploads/' + dir + '/' + newFileName + "/" + fileName
                }, (err, file) => {});
                promises.push(localUpload);
                promises.push(cloudUpload);
            }

            Promise.all(promises)
                .then(results => {
                    database.ref('clientFiles').push(files);
                })
                .then(() => {
                    return res.end("File uploaded sucessfully!");
                });




    });

});

router.post('/api/acceptFile', (req, res, next) => {
    try {
        var key = req.body.key;

        var sendTo = null;
        var sendFile = null;
        database.ref('clientFiles').child(key).once('value')
            .then(fileSnap => {
                var gotFile = fileSnap.val()[Object.keys(fileSnap.val())[0]];
                sendTo = gotFile.email;
                sendFile = Object.keys(fileSnap.val())[0];
                gotFile.accepted = true;
                return database.ref('acceptedFiles').child(key).set(fileSnap.val());
            })
            .then(() => {
                return database.ref('clientFiles').child(key).set(null);
            })
            .then(() => {
                return sendEmail(sendTo, "Paper accepted", "Congratulations !!!!\nYour paper '" + sendFile + "' has been accepted and will be shortly available on <a href='http://www.isctjounral.com'>website</a>");
            })
            .then(() => {
                res.status(200).json({
                    status: "success"
                });
            });

    } catch (err) {
        log(err);
    }
});
router.post('/api/rejectFile', (req, res, next) => {
    try {
        var key = req.body.key;
        var sendTo = null;
        var sendFile = null;
        database.ref('clientFiles').child(key).once('value')
            .then(fileSnap => {
                var gotFile = fileSnap.val()[Object.keys(fileSnap.val())[0]];
                sendTo = gotFile.email;
                sendFile = Object.keys(fileSnap.val())[0];
            })
            .then(() => {
                return sendEmail(sendTo, "Paper not accepted", "Your paper '" + sendFile + "' has not been accepted");
            })
            .then(() => {
                res.status(200).json({
                    status: "success"
                });
            });

    } catch (err) {
        log(err);
    }
});

router.post('/api/download', (req, res, next) => {
    try {
        var key = req.body.key;
        database.ref('clientFiles').child(key).once('value')
            .then(fileSnap => {
                var gotFile = fileSnap.val()[Object.keys(fileSnap.val())[0]];

            })
            .then(() => {
                res.status(200).json({
                    status: "success"
                });
            });

    } catch (err) {
        log(err);
    }
});

router.post('/api/viewFiles', (req, res, next) => {
    log("Getting files for " + logged_in_user.email);
    var sendThis = { files: [], reviewerID: -1 };
    var reviewerID = null;
    database.ref('reviewers').once('value')
        .then(reviewerSnapshot => {
            reviewerSnapshot.forEach(reviewer => {
                if (reviewer.val().email == logged_in_user.email) {
                    reviewerID = reviewer.val().id;
                    sendThis.reviewerID = reviewerID;
                }
            });
        })
        .then(() => {
            database.ref('clientFiles').once('value').then(keySnapshot => {
                keySnapshot.forEach(fileSnapshot => {
                    fileSnapshot.forEach(file_s => {
                        var file = file_s.val();
                        log(file.email + " => " + file.filename);
                        if (file.reviewer == reviewerID)
                            sendThis.files.push({
                                email: file.email,
                                filename: file_s.key,
                                key: fileSnapshot.key
                            });
                    });
                });

                return res.status(200).json(sendThis);
            });
        });

});

function log(val) {
    console.log(val);
}

function email(val) {
    log("Sending email to " + val.email);
}

function sendEmail(to, subject, msg) {
    var server = emailjs.server.connect({
        user: Buffer.from(process.env.EMAIL_USER, 'base64').toString(),
        password: Buffer.from(process.env.EMAIL_PASSWORD, 'base64').toString(),
        host: "smtp.ipower.com",
        port: 465,
        ssl: true
    });

    // send the message and get a callback with an error or details of the message that was sent
    return server.send({
        text: msg,
        from: "ISCTJ System <system@isctjournal.com>",
        to: "<" + to + ">",
        //cc: "else <else@your-email.com>",
        subject: subject
    }, (err, message) => { console.log(err || message); });
}

module.exports = router;