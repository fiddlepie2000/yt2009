// polyfill
if(!document.querySelector) {
    document.querySelector = function(name) {
        return polyfillSelectorAll(name, true)
    }
    document.querySelectorAll = function(name) {
        return polyfillSelectorAll(name, false)
    }
}

function trimLeft(input) {
    var temp = input;
    while(temp.indexOf(" ") == 0) {
        temp = temp.replace(" ", "")
    }

    return temp;
}

// document.querySelector
function polyfillSelectorAll(name, returnFirst) {
    var type = "id"
    var elementList = []
    if(name.indexOf(".") == 0) {
        name = name.replace(".", "")
        type = "className"
    } else {
        name = name.replace("#", "")
    }

    var s = document.getElementsByTagName("*")
    for(var sel in s) {
        try {
            if(s[sel][type].indexOf(name + " ") !== -1
            || s[sel][type].indexOf(" " + name) !== -1
            || s[sel][type] == name) {
                elementList.push(s[sel])
            }
        }
        catch(error) {}
    }

    if(returnFirst) {
        elementList = elementList[0]
    }
    return elementList
}

// getElementsByClassName
function getElementsByClassName(element, className) {
    var elementList = []
    var s = element.getElementsByTagName("*")
    for(var sel in s) {
        try {
            if(s[sel].className.indexOf(className + " ") !== -1
            || s[sel].className.indexOf(" " + className) !== -1
            || s[sel].className == className) {
                elementList.push(s[sel])
            }
        }
        catch(error) {}
    }
    return elementList
} 

function $(element) {
    if(document.querySelectorAll(element).length !== 1) {
        return document.querySelectorAll(element);
    } else {
        return document.querySelector(element)
    }
}

function nlToArray(nl) {
    var array = []
    var s = nl
    for(var e in s) {
        if(s[e].tagName) {
            array.push(s[e])
        }
    }
    return array;
}

// account funcs
function openTab(tabName) {
    var tabs = document.querySelectorAll(".section-page")
    for(var tab in tabs) {
        if(tabs[tab].className
        && tabs[tab].className.indexOf(tabName) !== -1) {
            tabs[tab].className = "section-page page-" + tabName
        } else if(tabs[tab].className
        && tabs[tab].className.indexOf(tabName) == -1) {
            tabs[tab].className += " hid"
        }
    }
    tabs = document.querySelectorAll(".tab")
    var href = "javascript:openTab('" + tabName + "');"
    for(var tab in tabs) {
        if(tabs[tab].className) {
            tabs[tab].className = "tab"
        }
        if(tabs[tab].className
        && tabs[tab].getElementsByTagName("a")[0].href == href) {
            tabs[tab].className += " current"
            var a = tabs[tab].getElementsByTagName("a")[0]
            document.getElementById("page-name").innerHTML = a.innerHTML
        }
    }

    // per-tab functionality
    switch(tabName) {
        case "homepage": {
            pullHomepageSettings()
            break;
        }
        case "playback": {
            pullPlaybackSettings()
            break;
        }
    }
}

// pre-switch on load with hash
switch(location.hash) {
    case "#customize/homepage": {
        openTab("homepage");
        break;
    }
    case "#playback/quality": {
        openTab("playback");
        break;
    }
}

// homepage
function saveHomepage() {
    var checks = document.querySelector(".page-homepage")
                .getElementsByTagName("input")
    var sections = ""
    for(var c in checks) {
        c = checks[c]
        if(c.tagName
        && c.getAttribute("type") == "checkbox"
        && c.checked) {
            sections += c.id + ","
        }
    }
    var cookie = [
        "homepage_picked=" + sections + "; ",
        "Path=/; ",
        "Expires=Fri, 31 Dec 2066 23:59:59 GMT"
    ]
    document.cookie = cookie.join("")
    var msg = $(".page-homepage-message")
    msg.style.display = "block"
    setTimeout(function() {
        msg.style.display = "none"
    }, 5000)
}

function pullHomepageSettings() {
    var cookies = document.cookie.split("; ")
    var settings = "rec,watched,featured,pop,inbox".split(",")
    for(var c in cookies) {
        c = cookies[c]
        if(c.indexOf("homepage_picked") == 0) {
            settings = c.split("homepage_picked=")[1].split(",")
        }
    }
    for(var s in settings) {
        s = settings[s]
        if(!s) return;
        document.getElementById(s).checked = true
    }
}

// fill overview data
var login = "username"
if(document.cookie
&& document.cookie.indexOf("login_simulate") !== -1
&& document.cookie.indexOf("pchelper_user") == -1) {
    login = document.cookie.split("login_simulate")[1].split(":")[0].split(";")[0]
    document.getElementById("overview-username").innerHTML = login
}

// count up favorites
var favoritesCount = 0;
if(localStorage
&& localStorage.favorites) {
    favoritesCount += JSON.parse(localStorage.favorites).length
}
if(document.cookie
&& document.cookie.indexOf("favorites=") !== -1) {
    var f = document.cookie.split("favorites=")[1].split(";")[0]
    favoritesCount += f.split(":").length
}
if(!document.cookie
|| document.cookie.indexOf("pchelper") == -1) {
    document.getElementById("videos-favd").innerHTML = favoritesCount
}

// playback settings
var playbackAnnotationsChanged = false;
var playbackCCChanged = false;
function savePlayback() {
    var playbackSetting = 0;
    var checks = getElementsByClassName(document, "playback-set")
    for(var c in checks) {
        var i = c;
        c = checks[c]
        if(c.tagName
        && c.checked) {
            playbackSetting = i;
        }
    }
    var cookie = [
        "playback_quality=" + playbackSetting + "; ",
        "Path=/; ",
        "Expires=Fri, 31 Dec 2066 23:59:59 GMT"
    ]
    document.cookie = cookie.join("")
    var msg = $(".page-playback-message")
    msg.style.display = "block"
    setTimeout(function() {
        msg.style.display = "none"
    }, 5000)

    var globalFlags = ""
    if(playbackAnnotationsChanged || playbackCCChanged
    || chaptersChanged || autoccChanged) {
        try {
            globalFlags = document.cookie.split("global_flags=")[1].split(";")[0]
        }
        catch(error) {}
    }
    if(playbackAnnotationsChanged) {
        var enabled = document.getElementById("playback-annotation-enable").checked
        if(!enabled && globalFlags.indexOf("always_annotations") !== -1) {
            globalFlags = globalFlags.replace("always_annotations:", "")
                          .replace("always_annotations", "")
        } else if(enabled && globalFlags.indexOf("always_annotations") == -1) {
            globalFlags += "always_annotations:"
        }
    }
    if(playbackCCChanged) {
        var enabled = document.getElementById("playback-cc-enable").checked
        if(!enabled && globalFlags.indexOf("always_captions") !== -1) {
            globalFlags = globalFlags.replace("always_captions:", "")
                          .replace("always_captions", "")
        } else if(enabled && globalFlags.indexOf("always_captions") == -1) {
            globalFlags += "always_captions:"
        }
    }
    if(chaptersChanged) {
        var enabled = document.getElementById("playback-chapters-disable").checked
        if(!enabled && globalFlags.indexOf("disable_chapters") !== -1) {
            globalFlags = globalFlags.replace("disable_chapters:", "")
                          .replace("disable_chapters", "")
        } else if(enabled && globalFlags.indexOf("disable_chapters") == -1) {
            globalFlags += "disable_chapters:"
        }
    }
    if(autoccChanged) {
        var enabled = document.getElementById("playback-autocc-disable").checked
        if(!enabled && globalFlags.indexOf("disable_autocc") !== -1) {
            globalFlags = globalFlags.replace("disable_autocc:", "")
                          .replace("disable_autocc", "")
        } else if(enabled && globalFlags.indexOf("disable_autocc") == -1) {
            globalFlags += "disable_autocc:"
        }
    }
    if(playbackAnnotationsChanged || playbackCCChanged
    || chaptersChanged || autoccChanged) {
        var cookie = [
            "global_flags=" + globalFlags + "; ",
            "Path=/; ",
            "Expires=Fri, 31 Dec 2066 23:59:59 GMT"
        ]
        document.cookie = cookie.join("")
    }
}

function pullPlaybackSettings() {
    var cookies = document.cookie.split("; ")
    var quality = 1; //slow
    for(var c in cookies) {
        c = cookies[c]
        if(c.indexOf("playback_quality") == 0) {
            quality = parseInt(c.split("playback_quality=")[1].split(","))
        }
    }
    getElementsByClassName(document, "playback-set")[quality].setAttribute("checked", "true")

    if(document.cookie.indexOf("always_annotations") !== -1) {
        document.getElementById("playback-annotation-enable").checked = true;
    }
    if(document.cookie.indexOf("always_captions") !== -1) {
        document.getElementById("playback-cc-enable").checked = true;
    }
    if(document.cookie.indexOf("disable_chapters") !== -1) {
        document.getElementById("playback-chapters-disable").checked = true;
    }
    if(document.cookie.indexOf("disable_autocc") !== -1) {
        document.getElementById("playback-autocc-disable").checked = true;
    }
}

function markCcChanged() {
    playbackCCChanged = true;
}

function markAnnotationsChanged() {
    playbackAnnotationsChanged = true;
}

// expanders
function toggleExpander(context, expanderName) {
    // check if toggled expander is current
    var targetExpander = getElementsByClassName(
        getElementsByClassName(document, "page-" + context)[0],
        "section-" + expanderName
    )[0]
    var isCurrentExpander = false;
    if(targetExpander.className.indexOf("current") !== -1) {
        isCurrentExpander = true;
    }

    // hide all expanders from context
    var expanders = getElementsByClassName(
        getElementsByClassName(document, "page-" + context)[0],
        "section"
    )
    for(var e in expanders) {
        e = expanders[e]
        if(e.tagName) {
            e.className = e.className.replace(" current", "")
            getElementsByClassName(e, "page")[0].className += " hid"
            getElementsByClassName(e, "bullet")[0].style.backgroundPosition = ""
        }
    }

    if(isCurrentExpander) return;
    targetExpander.className += " current"
    var expanderContent = getElementsByClassName(targetExpander, "page")[0]
    expanderContent.className = expanderContent.className.split("hid").join("")
    getElementsByClassName(targetExpander, "bullet")[0].style.backgroundPosition = "-78px 0px"
}

function showPictureChangeDialog() {
    document.getElementById("overlay-cover").className = "cover"
    document.getElementById("avatar-picker").className = ""
}

function hidePictureChangeDialog() {
    document.getElementById("overlay-cover").className = "cover hid"
    document.getElementById("avatar-picker").className = "hid"
}

function getPickedStill() {
    return parseInt(document.getElementById("picked-video-still").value)
}

function pickVideoStill(stillId, videoId) {
    var currentStill = getPickedStill()
    if(currentStill == stillId) {
        // unpick still if clicked on the same one twice
        document.getElementById("picked-video-still").value = "0"
        document.getElementById("video-still-" + stillId).className = ""
        return;
    }

    // unpick all stills
    var stills = getElementsByClassName(document, "video-still-picker")[0]
                 .getElementsByTagName("a");
    for(var s in stills) {
        s = stills[s]
        if(s.tagName) {
            s.className = ""
        }
    }

    // pick still
    document.getElementById("video-still-" + stillId).className = "selected"
    document.getElementById("picked-video-still").value = stillId
    document.getElementById("picked-video-still-id").value = videoId
}

// autoshare settings

// make sure pchelper is used
if(!document.cookie
|| document.cookie.indexOf("pchelper_user=") == -1) {
    document.getElementById("pchelper-sharing-notice").className = "bold"
}

// set radio to enabled if autosharing enabled
if(document.cookie
&& document.cookie.indexOf("autoshare_status=sharing-enabled") !== -1) {
    document.getElementById("sharing-disabled").checked = false;
    document.getElementById("sharing-enabled").checked = true;
}

if(document.cookie
&& document.cookie.indexOf("autoshare_settings=") !== -1) {
    var settings = document.cookie.split("autoshare_settings=")[1].split(";")[0]
    settings = settings.split(":")
    for(var s in settings) {
        if(settings[s] && document.getElementById(settings[s])
        && document.getElementById(settings[s]).tagName) {
            document.getElementById(settings[s]).checked = true;
        }
    }
}

function saveActivity() {
    var sharingState = (
        document.getElementById("sharing-enabled").checked
        ? "sharing-enabled" : "sharing-disabled"
    )
    var cookie = [
        "autoshare_status=" + sharingState + "; ",
        "Path=/; ",
        "Expires=Fri, 31 Dec 2066 23:59:59 GMT"
    ]
    document.cookie = cookie.join("")


    var sharingSettings = []
    var checks = document.getElementById("autoshare-a")
                         .getElementsByTagName("input")
    for(var c in checks) {
        if(checks[c] && checks[c].tagName && checks[c].checked) {
            sharingSettings.push(checks[c].id)
        }
    }
    sharingSettings = sharingSettings.join(":")
    cookie = [
        "autoshare_settings=" + sharingSettings + "; ",
        "Path=/; ",
        "Expires=Fri, 31 Dec 2066 23:59:59 GMT"
    ]
    document.cookie = cookie.join("")

    var msg = $(".page-activity-message")
    msg.style.display = "block"
    setTimeout(function() {
        msg.style.display = "none"
    }, 5000)
}

// autoshare service(s)
function confirmDisconnect(service) {
    var a = confirm("Are you sure you want to disconnect this account?")
    if(a) {
        location.href = "/autoshare_disconnect?s=" + service
    }
}

function resolveService(name) {
    var r;
    if (window.XMLHttpRequest) {
        r = new XMLHttpRequest()
    } else {
        r = new ActiveXObject("Microsoft.XMLHTTP");
    }
    r.open("GET", "/autoshare_resolve_user?s=" + name)
    r.send(null)
    r.onreadystatechange = function(e) {
        if((r.readyState && r.readyState == 4)
        || (this.readyState && this.readyState == 4)
        || (e.readyState && e.readyState == 4)) {
            var nameElement = document.getElementById("autoshare-name-" + name)
            var linkElement = document.getElementById("autoshare-link-" + name)
            nameElement.innerHTML += " / " + r.responseText;
            linkElement.innerHTML = "Disconnect accounts"
            linkElement.href = "javascript:confirmDisconnect('bsky')"
        }
    }
}

var services = ["bsky"]
for(var s in services) {
    if(services[s] && document.cookie
    && document.cookie.indexOf(services[s] + "_uid=") !== -1
    && document.cookie.indexOf(services[s] + "_eck=") !== -1) {
        resolveService(services[s])
    }
}

// profile setup (wip)
function saveProfile() {
    document.getElementById("pchelper-profile-setup-form").submit()
}

// modern features -- playback setup
var chaptersChanged = false;
var autoccChanged = false;
var alttrackChanged = false;
function markChaptersChanged() {
    chaptersChanged = true;
}
function markAutoccChanged() {
    autoccChanged = true;
}
function markAlttrack() {
    alttrackChanged = true;
}