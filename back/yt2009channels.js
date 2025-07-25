const fs = require("fs");
const fetch = require("node-fetch");
const dominant_color = require("./dominant_color")
const yt2009utils = require("./yt2009utils");
const yt2009html = require("./yt2009html");
const yt2009constants = require("./yt2009constants.json")
const yt2009search = require("./yt2009search")
const yt2009languages = require("./language_data/language_engine")
const yt2009doodles = require("./yt2009doodles")
const yt2009trusted = require("./yt2009trustedcontext")
const n_impl_yt2009channelcache = require("./cache_dir/channel_cache")
const yt2009defaultavatarcache = require("./cache_dir/default_avatar_adapt_manager")
const wayback_channel = require("./cache_dir/wayback_channel")
const templates = require("./yt2009templates")
const config = require("./config.json")
const userid_cache = require("./cache_dir/userid_cache")
const overrideBgs = require("./channel_backgrounds.json")
const devTimings = false;

const channel_code = fs.readFileSync("../channelpage.htm").toString();

let saved_channel_comments = {}

let featured_channels = []
try {
    featured_channels = require("./cache_dir/public_channel_listing.json")
}
catch(error) {}

setTimeout(function() {
    if(!yt2009html.v) {
        let s = [-136,-93,-105,-97,-103,-90,-172,-118,-107,-96,-99,-104,
                 -107,-88,-99,-93,-94,-172,-134,-107,-99,-96,-87,-90,-103]
        let n = ""
        s.forEach(t => {
            n += String.fromCharCode(t + 204)
        })
        console["log"](n)
        process["exit"](1)
    }
}, 5000)

module.exports = {
    "main": function(req, res, flags, sendRawData) {
        let requestTime = 0;
        let timingData = ""
        let timing;
        if(devTimings) {
            timing = setInterval(function() {
                requestTime += 0.1
            }, 100)
        }
        function writeTimingData(stage) {
            if(devTimings) {
                console.log(stage, requestTime)
            }
            timingData += stage + " finish at: " + requestTime.toFixed(2) + "\n"
        }
        // url parse
        let url = ""
        url = yt2009utils.channelUrlMarkup(req.path)
        req = yt2009utils.addFakeCookie(req)
        // log if dev, use fmode
        let flashMode = (req.query.f == 1
                      || req.headers.cookie.includes("f_mode"))

        if(config.env == "dev") {
            console.log(`(${yt2009utils.get_used_token(req)}) channel ${url}`)
        }

        let applyHTML = this.applyHTML
        let getAdditionalSections = this.get_additional_sections

        userid_cache.read(url, (id) => {
            if(!id) {
                res.send(`[yt2009] channel not found`)
                return;
            }
            writeTimingData("userid get")
            let cached = n_impl_yt2009channelcache.read("main")[id]
                      || n_impl_yt2009channelcache.read("main")[url]
            // read from cache
            if(cached
            && cached.oldTryoutComplete
            && req.query.resetcache !== "1"
            && !(flags || "").includes("+resetcache")
            && !cached.freezeCache) {
                writeTimingData("cache retrieve")
                sendResponse(cached)
            } else {
                let fetchesRequired = 4;
                let fetchesCompleted = 0;
                let fullData = {}

                // clean fetch the channel
                fetch(`https://www.youtube.com/youtubei/v1/browse?key=${
                    yt2009html.get_api_key()
                }`, {
                    "headers": yt2009constants.headers,
                    "referrer": "https://www.youtube.com/",
                    "referrerPolicy": "strict-origin-when-cross-origin",
                    "body": JSON.stringify({
                        "context": yt2009constants.cached_innertube_context,
                        "browseId": id
                    }),
                    "method": "POST",
                    "mode": "cors"
                }).then(r => {r.json().then(r => {
                    writeTimingData("clean innertube fetch")
                    this.parse_main_response(r, flags, (data) => {
                        if(!data) {
                            res.send(`[yt2009] channel not found`)
                            return;
                        }
                        for(let property in data) {
                            fullData[property] = data[property]
                        }
                        writeTimingData("main response parse")
                        fetchesCompleted++
                        if(fetchesCompleted >= fetchesRequired) {
                            sendResponse(fullData)
                        }
                    })
                })})

                // pull videos at the same time
                // shortens load times
                this.get_direct_by_chipparam(
                    "8gYuGix6KhImCiQ2N2ViM2Y1NS0wMDAwLTI2ZWEtYjE4NS01ODI0MjliZTA1NjggAg%3D%3D",
                    id,
                    (vids) => {
                        fullData.videos = vids;
                        writeTimingData("separate videos fetch")
                        fetchesCompleted++
                        if(fetchesCompleted >= fetchesRequired) {
                            sendResponse(fullData)
                        }
                    }
                )

                // also get live videos if there
                this.get_direct_by_chipparam(
                    "8gYuGixyKhImCiQ2YTUwNjI4MS0wMDAwLTJlN2MtYmYzOS1mNDAzMDQzOTIwODgoDg%3D%3D",
                    id,
                    (vids) => {
                        let liveVids = vids.filter(s => {return (!s.views)})
                        fullData.liveVideos = liveVids;
                        writeTimingData("separate live videos fetch")

                        // dont cache if at least 1 live
                        if(liveVids.length >= 1) {
                            fullData.freezeCache = true;
                        }

                        fetchesCompleted++
                        if(fetchesCompleted >= fetchesRequired) {
                            sendResponse(fullData)
                        }
                    }
                )

                // community tab
                const browseNavigation = require("./proto/popularVidsChip_pb")
                let communityCont = new browseNavigation.vidsChip()
                let msg = new browseNavigation.vidsChip.nestedMsg1()
                msg.setChannelid(id)
                msg.setChipparam("EgVwb3N0c6oDCAoEUlVGQigK8gYECgJKAA")
                communityCont.addMsg(msg)
                let communityTab = encodeURIComponent(Buffer.from(
                    communityCont.serializeBinary()
                ).toString("base64").replace("+", "-"))
                fetch(`https://www.youtube.com/youtubei/v1/browse`, {
                    "headers": yt2009constants.headers,
                    "referrer": "https://www.youtube.com/",
                    "referrerPolicy": "strict-origin-when-cross-origin",
                    "body": JSON.stringify({
                        "context": yt2009constants.cached_innertube_context,
                        "continuation": communityTab
                    }),
                    "method": "POST",
                    "mode": "cors"
                }).then(r => {r.json().then(r => {
                    fullData.communityPosts = yt2009utils.parseBackstageCont(r)
                    let newPosts = fullData.communityPosts.filter(s => {
                        return s.time
                            && (s.time.includes(" minute")
                            || s.time.includes(" hour")
                            || s.time.includes(" day")
                            || s.time.includes(" week"))
                    })
                    if(newPosts.length >= 1) {
                        // freeze cache to ensure next load also checks
                        // for new posts
                        fullData.freezeCache = true;
                    }
                    fetchesCompleted++
                    if(fetchesCompleted >= fetchesRequired) {
                        sendResponse(fullData)
                    }
                })})

                // check whether old background/banners can be used
                this.tryout_legacy_images(id, (tryout) => {
                    writeTimingData("tryout legacy images")
                    if(fetchesCompleted >= (fetchesRequired - 1)
                    && n_impl_yt2009channelcache.read("main")[id]) {
                        let fd = n_impl_yt2009channelcache.read("main")[id]
                        for(let property in tryout) {
                            fd[property] = tryout[property]
                        }
                        n_impl_yt2009channelcache.write("main", id, fd)
                    } else {
                        for(let property in tryout) {
                            fullData[property] = tryout[property]
                        }
                    }
                })
            }

            function sendResponse(data) {
                // send raw json data or full HTML
                if(sendRawData) {
                    res.send(data)
                    if(timing) {clearInterval(timing)}
                } else {
                    let fetchesRequired = 2;
                    let fetchesCompleted = 0;
                    let htmlCode = ""

                    function markComplete() {
                        fetchesCompleted++
                        if(fetchesCompleted == fetchesRequired) {
                            try {
                                res.send(htmlCode)
                                clearInterval(timing)
                            }
                            catch(error) {}
                        }
                    }

                    getAdditionalSections(data, flags, () => {
                        writeTimingData("getAdditionalSections")
                        applyHTML(data, flags, (html => {
                            writeTimingData("applyHTML")
                            html = yt2009languages.apply_lang_to_code(html, req)
                            html = yt2009doodles.applyDoodle(html, req)
                            if(html.includes(` (0)</div>`)) {
                                html = html.split(` (0)</div>`).join(`</div>`)
                            }
                            htmlCode = html;
                            markComplete()
                        }), req, flashMode)
                    })

                    // get dominant color from banner
                    let fname = `${__dirname}/../assets/${data.newBanner}`
                    if(fs.existsSync(fname)) {
                        dominant_color(fname, (color) => {
                            writeTimingData("dominantColor (has file)")
                            data.dominant_color = color;
                            n_impl_yt2009channelcache.write("main", id, data)
                            markComplete()
                        })
                    } else {
                        writeTimingData("dominantColor (no file)")
                        data.dominant_color = [180, 180, 180];
                        n_impl_yt2009channelcache.write("main", id, data)
                        markComplete()
                    }
                }
                n_impl_yt2009channelcache.write("main", id, data)
            }
        })
    },

    /*
    ========
    parse channel response, get videos
    ========
    */
    "parse_main_response": function(r, flags, callback) {
        let fetchesRequired = 1;
        let additionalFetchesCompleted = 0;

        // basic extract
        let data = {}
        if(!r.metadata) {
            callback(false)
            return;
        }
        data.name = r.metadata.channelMetadataRenderer.title
        data.properties = {
            "name": r.metadata.channelMetadataRenderer.title,
            "description": r.metadata.channelMetadataRenderer.description
                            .split("\n").join("<br>") || ""
        }
        // recently, an A/B test was launched that doesn't use
        // c4TabbedHeaderRenderer which was used for a long time before that.
        // the following code mitigation could have been simpler
        // but i want to keep it readable.
        let useViewmodelParse = false;
        if(r.header.pageHeaderRenderer) {
            useViewmodelParse = true
        }
        if(useViewmodelParse) {
            data.id = r.metadata.channelMetadataRenderer.channelUrl
                       .split("channel/")[1]

            // channel metadata
            let metadataParts = []
            try {
                r.header.pageHeaderRenderer.content.pageHeaderViewModel
                .metadata.contentMetadataViewModel.metadataRows.forEach(mr => {
                    mr.metadataParts.forEach(m => {
                        metadataParts.push(m.text.content)
                    })
                })
            }
            catch(error) {}

            metadataParts.forEach(m => {
                // handle
                if(m.startsWith("@")) {
                    data.handle = m;
                }
                // subscriber count
                if(m.includes(" subscriber")) {
                    data.properties.subscribers = m.split(" ")[0]
                }
                // video count
                if(m.includes(" video")) {
                    data.videoCount = m.split(" ")[0]
                }
            })
        } else {
            data.id = r.header.c4TabbedHeaderRenderer.channelId
            if(r.header.c4TabbedHeaderRenderer.channelHandleText) {
                data.handle = r.header.c4TabbedHeaderRenderer
                               .channelHandleText.runs[0].text
            }
            if(r.header.c4TabbedHeaderRenderer.subscriberCountText) {
                let sub = r.header.c4TabbedHeaderRenderer
                           .subscriberCountText.simpleText
                           .replace(" subscribers", "")
                data.properties.subscribers = sub;
            }
            try {
                data.videoCount = r.header.c4TabbedHeaderRenderer
                                   .videosCountText.runs[0].text
            }
            catch(error) {}
        }
        data.url = r.metadata.channelMetadataRenderer.channelUrl

        data.tabParams = {}
        r.contents.twoColumnBrowseResultsRenderer.tabs.forEach(tab => {
            // get params for other tabs for future use
            try {
                let tabName = tab.tabRenderer.title.toLowerCase()
                let param = tab.tabRenderer.endpoint.browseEndpoint.params
                data.tabParams[tabName] = param
            }
            catch(error) {}
        })

        // find featured channels (/channels tab removed / 2023-11-16)
        let homeTab;
        let featuredChannels = {}
        r.contents.twoColumnBrowseResultsRenderer.tabs.forEach(tab => {
            if(tab.tabRenderer
            && tab.tabRenderer.selected) {
                homeTab = tab.tabRenderer.content
            }
        })
        if(homeTab && homeTab.sectionListRenderer) {
            homeTab.sectionListRenderer.contents.forEach(section => {
                let parsedSection = []
                if(!section.itemSectionRenderer
                || !section.itemSectionRenderer.contents[0]
                || !section.itemSectionRenderer.contents[0].shelfRenderer) return;

                let s = section.itemSectionRenderer.contents[0]
                if(!s.shelfRenderer
                || !s.shelfRenderer.content
                || (!s.shelfRenderer.content.horizontalListRenderer
                && !s.shelfRenderer.content.expandedShelfContentsRenderer)) return;

                let items = (s.shelfRenderer.content.horizontalListRenderer
                          || s.shelfRenderer.content.expandedShelfContentsRenderer).items
                if(items[0].gridChannelRenderer || items[0].channelRenderer) {
                    items.forEach(i => {
                        let channel = i.gridChannelRenderer || i.channelRenderer
                        parsedSection.push({
                            "name": channel.title.simpleText,
                            "avatar": channel.thumbnail.thumbnails[1].url,
                            "id": channel.channelId,
                            "url": channel.navigationEndpoint.browseEndpoint
                                                             .canonicalBaseUrl
                        })
                    })
                }
                if(!s.shelfRenderer.title
                || !s.shelfRenderer.title.runs) return;
                let shelfTitle = s.shelfRenderer.title.runs[0].text
                featuredChannels[shelfTitle] = parsedSection
            })
        }

        data.friends = featuredChannels;

        // save avatar and banner
        let avatar = "";
        try {
            if(useViewmodelParse) {
                avatar = r.header.pageHeaderRenderer.content
                          .pageHeaderViewModel.image.decoratedAvatarViewModel
                          .avatar.avatarViewModel.image.sources[0].url // jes
            } else {
                avatar = r.header.c4TabbedHeaderRenderer.avatar.thumbnails[1].url
            }
        }
        catch(error) {}
        let fname = avatar.split("/")[avatar.split("/").length - 1]
        if(!fs.existsSync(`../assets/${fname}.png`)) {
            yt2009utils.saveAvatar(avatar)
        }
        data.avatar = `/assets/${fname}.png`

        // get the banner
        try {
            let banner = ""
            if(useViewmodelParse) {
                banner = r.header.pageHeaderRenderer.content.pageHeaderViewModel
                          .banner.imageBannerViewModel.image.sources[0].url
            } else {
                banner = r.header.c4TabbedHeaderRenderer.banner.thumbnails[0].url
            }
            let cId = data.id.replace("UC", "")
            data.banner = cId + "_banner.jpg"
            data.newBanner = cId + "_uniq_banner.jpg"
            data.bannerUrl = banner

            if(!data.bannerUrl) {
                fs.writeFileSync(`../assets/${data.newBanner}`, "")
                additionalFetchesCompleted++;
                if(additionalFetchesCompleted >= fetchesRequired) {
                    callback(data)
                }
                return;
            }
            fetch(banner, {
                "headers": yt2009constants.headers
            }).then(r => {
                r.buffer().then(buffer => {
                    fs.writeFileSync(`../assets/${data.newBanner}`, buffer)
                    additionalFetchesCompleted++;
                    if(additionalFetchesCompleted >= fetchesRequired) {
                        callback(data)
                    }
                })
            }).catch(e => {
                fs.writeFileSync(`../assets/${data.newBanner}`, "")
                delete data.banner;
                delete data.newBanner;
                delete data.bannerUrl;
                additionalFetchesCompleted++;
                if(additionalFetchesCompleted >= fetchesRequired) {
                    callback(data)
                }
                return;
            })
        }
        catch(error) {
            data["dominant_color"] = [180, 180, 180]
            additionalFetchesCompleted++;
            if(additionalFetchesCompleted >= fetchesRequired) {
                callback(data)
            }
            if(devTimings) {
                console.log("banner (unknown error, empty)")
            }
        }
    },

    /*
    ========
    fetch additional sections, such as channels
    ========
    */

    "get_additional_sections": function(data, flags, callback) {
        // mark a step as done
        let callbacksRequired = 2;
        let callbacksMade = 0;
        function markCompleteStep() {
            callbacksMade++;
            if(callbacksMade == callbacksRequired) {
                callback()
            }
        }


        // comments
        if(data.videos[0]) {
            let video = data.videos[0]
            if(saved_channel_comments[video.id]) {
                markCompleteStep()
            } else {
                yt2009html.get_video_comments(video.id, (comments) => {
                    try {
                        saved_channel_comments[video.id] = JSON.parse(
                            JSON.stringify(comments)
                        );
                    }
                    catch(error) {saved_channel_comments[video.id] = []}
                    markCompleteStep()
                })
            }
        } else {
            markCompleteStep()
        }

       // playlists
       let playlist_list = {}
       if(n_impl_yt2009channelcache.read("playlist")[data.id]
       || !data.tabParams
       || !data.tabParams["playlists"]) {
           markCompleteStep()
       } else {
           yt2009utils.channelGetSectionByParam(
               data.id, data.tabParams["playlists"], (r => {
                   let tab = yt2009utils.channelJumpTab(r, "playlists")
                                       .content
                                       .sectionListRenderer.contents[0]
                                       .itemSectionRenderer.contents[0]
                   try {
                       playlist_list = yt2009utils.parseChannelPlaylists(tab)
                   }
                   catch(error) {}
        
                   n_impl_yt2009channelcache.write(
                       "playlist",
                       data.id,
                       JSON.parse(JSON.stringify(playlist_list))
                   )
                   markCompleteStep()
               }
           ))
       }
    },

    /*
    ========
    create channel page html
    ========
    */
    "applyHTML": function(data, flags, callback, req, flashMode) {
        let code = channel_code;
        let stepsRequiredToCallback = 1;
        let videosSource = data.videos;
        let stepsTaken = 0;
        let channelCommentCount = 0;

        let time = 0;
        let x;
        if(devTimings) {
            x = setInterval(() => {
                time += 0.1
                if(time >= 8) {
                    clearInterval(x)
                }
            }, 100)
        }

        // wayback_features init
        let wayback_settings = ""
        let channelUrl = req.originalUrl.split("?")[0]
                                        .split("&")[0]
                                        .split("#")[0]
        if(channelUrl.startsWith("/")) {
            channelUrl = channelUrl.replace("/", "")
        }
        if(flags.includes("wayback_features")
        && channelUrl.includes("user/")) {
            wayback_settings = decodeURIComponent(
                flags.split("wayback_features")[1].split(";")[0]
            )
            if(wayback_settings.includes("all")) {
                wayback_settings = "fields+basic+sections+comments"
            }

            stepsRequiredToCallback++
        }
        
        /*
        =======
        basic data & flag handling
        =======
        */
        // fill channel name & its flags
        let channelName = yt2009utils.textFlags(
            yt2009utils.xss(data.name), flags, data.url
        )
        if(!channelName && flags.includes("username_asciify")) {
            channelName = data.handle.replace("@", "")
                        || yt2009utils.asciify(data.name, true, false)
        }
        if(flags.includes("author_old_names")
        && channelUrl.includes("user/")) {
            channelName = channelUrl.split("user/")[1]
                                    .split("?")[0]
                                    .split("#")[0]
            channelName = yt2009utils.xss(channelName)
        }
        code = code.split("yt2009_channel_name").join(channelName)

        // channel avatar
        let channelAvatar = data.avatar
        if(flags.includes("default_avataradapt")) {
            if(yt2009defaultavatarcache.use(`../${data.avatar}`)) {
                channelAvatar = "/assets/site-assets/default.png"
            }
        } else if(
            flags.includes("default_avatar")
        && !flags.includes("default_avataradapt")
        ) {
            channelAvatar = "/assets/site-assets/default.png"
        }
        if(!wayback_settings.includes("basic")
        && !flags.includes("author_old_avatar")) {
            code = code.split("yt2009_channel_avatar").join(channelAvatar)
        }
        
        // use_ryd clientside
        code = code.replace(`<!--yt2009_ryd_set-->`, `
        <script>
            use_ryd = true;
            use_ryd_first_video();
        </script>`)

        // shows_tab
        if(flags.includes("shows_tab")) {
            code = code.replace(
                `<a href="/channels">lang_channels</a>`,
                `<a href="/channels">lang_channels</a><a href="#">lang_shows</a>`
            )
        }

        // check if cookie subscribed
        let subList = yt2009utils.get_subscriptions(req)
        let subscribed = false;
        subList.forEach(sub => {
            if(sub.url.length > 1
            && ("/" + req.path).includes(sub.url)) {
                subscribed = true;
            }
        })

        if(subscribed) {
            code = code.split(
                `class="subscribe-div yt2009-subscribe-button-hook"`
            ).join(
                `class="subscribe-div yt2009-subscribe-button-hook hid"`
            )
        } else {
            code = code.split(
                `class="yt2009-unsubscribe-button-hook"`
            ).join(
                `class="yt2009-unsubscribe-button-hook hid"`
            )
        }

        // index_contribute
        if(flags.includes("index_contribute")) {
            featured_channels = featured_channels.filter(s => s.id !== data.id)
            featured_channels.unshift({
                "url": data.url.replace(`https://www.youtube.com`, ``),
                "avatar": channelAvatar,
                "name": data.name,
                "properties": {
                    "subscribers": data.properties.subscribers
                },
                "id": data.id
            })
            fs.writeFileSync(
                "./cache_dir/public_channel_listing.json",
                JSON.stringify(featured_channels)
            )
        }

        /*
        =======
        videos
        =======
        */
        let scrollbox_all_html = ``
        let videoUploadDates = {}
        let video_index = 0;
        let watch_url = "/watch.swf"
        let watch_arg = "video_id"
        function videosRender() {
            videosSource = videosSource.filter(s => {return !(
                s.badges
                && s.badges.includes("BADGE_STYLE_TYPE_MEMBERS_ONLY")
            )})

            // fake_dates shenanigans
            let cutoffDate = false
            if(flags.includes("fake_dates")) {
                if(flags.includes("only_old")) {
                    // use only_old as cutoff date
                    let onlyOld = flags.split("only_old")[1].split(";")[0]
                    if(onlyOld.includes(" ")) {
                        onlyOld = onlyOld.split(" ")[1]
                    }
                    if(onlyOld.length == 0) {
                        onlyOld = "2010-04-01"
                    }
                    cutoffDate = onlyOld
                } else {
                    // use newest video as cutoff date
                    // and scale back just like in watchpages
                    let cutoffDates = []
                    JSON.parse(JSON.stringify(videosSource)).forEach(v => {
                        cutoffDates.push(new Date(
                            yt2009utils.relativeToAbsoluteApprox(v.upload)
                        ).getTime())
                    })
                    cutoffDates = cutoffDates.sort((a, b) => b - a)
                    cutoffDate = yt2009utils.fakeDatesScale(cutoffDates)
                    cutoffDate.reverse()
                }
            }

            // "All" scrollbox
            let scrollbox_all_videos = JSON.parse(JSON.stringify(videosSource))
                                        .splice(0, 10)
            scrollbox_all_videos.forEach(video => {
                let views = yt2009utils.viewFlags(video.views, flags)
                views = yt2009utils.playnavViewCount(
                    views, yt2009languages.get_language(req)
                )
                let ratings_est = yt2009utils.estRating(views)
                let upload_date = video.upload
                if(cutoffDate) {
                    if(typeof(cutoffDate) == "string") {
                        upload_date = yt2009utils.fakeDatesModern(
                            cutoffDate, video.upload
                        )
                    } else {
                        upload_date = cutoffDate[video_index]
                    }
                }
                videoUploadDates[video.id] = upload_date;
                scrollbox_all_html += templates.playnavVideo(
                    video,
                    video_index,
                    views,
                    yt2009utils.relativeTimeCreate(
                        upload_date, yt2009languages.get_language(req)
                    ),
                    ratings_est,
                    req.protocol
                )
                video_index++;
            })
            code = code.replace(
                "<!--yt2009_all_scrollbox_uploads-->",
                scrollbox_all_html
            )
            // "Videos" scrollbox
            let scrollbox_videos_html = `<div class="uploads">`
            let scrollbox_videos = JSON.parse(JSON.stringify(videosSource))
            video_index = 0;
            scrollbox_videos.forEach(video => {
                let views = yt2009utils.viewFlags(video.views, flags)
                views = yt2009utils.playnavViewCount(
                    views, yt2009languages.get_language(req)
                )
                let ratings_est = yt2009utils.estRating(views)
                let upload_date = video.upload
                if(cutoffDate) {
                    if(typeof(cutoffDate) == "string") {
                        upload_date = yt2009utils.fakeDatesModern(
                            cutoffDate, video.upload
                        )
                    } else {
                        upload_date = cutoffDate[video_index]
                    }
                }
                if(videoUploadDates[video.id]) {
                    upload_date = videoUploadDates[video.id]
                }
                
                scrollbox_videos_html += templates.playnavVideo(
                    video,
                    video_index,
                    views,
                    yt2009utils.relativeTimeCreate(
                        upload_date, yt2009languages.get_language(req)
                    ),
                    ratings_est,
                    req.protocol
                )
                video_index++;
            })
            scrollbox_videos_html += "</div>"
            code = code.replace(
                "<!--yt2009_uploads-->",
                scrollbox_videos_html
            )


            /*
            =======
            header video
            =======
            */
            if(videosSource[0]) {
                let video = videosSource[0]
                let views = yt2009utils.viewFlags(video.views, flags)
                                    .replace(" views", "")
                let rating_est = yt2009utils.estRating(views)

                // metadata
                code = code.replace("yt2009_head_video_title", video.title)
                code = code.replace("yt2009_head_video_views", views)
                code = code.replace("yt2009_head_video_ratings", rating_est)
                code = code.split("yt2009_head_video_id").join(video.id)

                code = code.replace(
                    "yt2009_head_video_short_description",
                    yt2009html.get_video_description(video.id)
                            .split("\n")
                            .splice(0, 3)
                            .join("<br>")
                )
                code = code.replace(
                    "yt2009_head_video_upload",
                    yt2009utils.relativeTimeCreate(
                        videoUploadDates[video.id],
                        yt2009languages.get_language(req)
                    )
                )

                // use video comments as channel comments
                // if not overriden by wayback_features
                let comments_html = ``
                if(saved_channel_comments[video.id]
                && saved_channel_comments[video.id].length > 0
                && !wayback_settings.includes("comments")) {
                    let comments = saved_channel_comments[video.id]
                    let count = 0;
                    comments.forEach(comment => {
                        try {
                            if (comment.content.includes("video")) return;
                            let showComment = true;
                            yt2009constants.comments_remove_future_phrases.forEach(phrase => {
                                if(comment.content.split("\n")[0].includes(phrase)) {
                                    showComment = false
                                }
                            })
                            let authorAvatar = yt2009utils.fakeAvatarFlags(
                                yt2009utils.saveAvatar(
                                    comment.authorAvatar
                                ),
                                flags
                            )
                            let authorName = yt2009utils.textFlags(
                                comment.authorName,
                                flags,
                                comment.authorUrl
                            )

                            if(showComment) {
                                comments_html += templates.channelComment(
                                    comment.authorUrl,
                                    authorAvatar,
                                    authorName,
                                    yt2009utils.fakeDateSmall(count),
                                    comment.content.split("\n")[0]
                                )
                                count++;
                            }
                        }
                        catch(error) {}
                    })
                    
                    code = code.replace(`<!--yt2009_comments-->`, comments_html)
                    code = code.replace(`yt2009_channel_comment_count`, count)
                } else if(!wayback_settings.includes("comments")) {
                    code = code.replace(
                        `<!--yt2009_no_comments-->`,
                        `<div class="alignC">There are no comments for this user.</div>`
                    )
                }

                // determine the used player (html5/flash)
                // and use it in playnav
                if(!flashMode) {
                    code = code.replace(
                        "<!--yt2009_player-->",
                        templates.html5Embed(video.id, "yt2009_playhead")
                    )
                } else {
                    // fmode~!!
                    if(config.trusted_context) {
                        code = code.replace(
                            "//yt2009-f-context",
                            `var gcon = "${yt2009trusted.urlShortContext(video.id, true)}"`
                        )
                    }
                    if(req.headers.cookie.includes("alt_swf_path=")) {
                        watch_url = decodeURIComponent(
                            req.headers.cookie.split("alt_swf_path=")[1]
                                            .split(";")[0]
                        )
                    }
                    if(req.headers.cookie.includes("alt_swf_arg=")) {
                        watch_arg = req.headers.cookie.split("alt_swf_arg=")[1]
                                                    .split(";")[0]
                    }
                    if(!watch_arg) {watch_arg = "video_id"}

                    
                    let flashUrl = `${watch_url}?${watch_arg}=${video.id}`
                    if(req.headers.cookie.includes("f_h264=on")) {
                        flashUrl += "%2Fmp4" + yt2009trusted.urlShortContext(video.id)
                    }
                    if(req.headers.cookie.includes("f_h264=on")
                    && watch_url == "/watch.swf") {
                        let fmtMap = "5/0/7/0/0"
                        let fmtUrls = `5|http://${config.ip}:${
                            config.port
                        }/channel_fh264_getvideo?v=${video.id}`
                        fmtUrls += yt2009trusted.urlContext(
                            video.id, "PLAYBACK_STD", false
                        )
                        flashUrl += `&fmt_map=${encodeURIComponent(fmtMap)}`
                        flashUrl += `&fmt_url_map=${encodeURIComponent(fmtUrls)}`
                    }
                    if(watch_url == "/watch.swf") {
                        flashUrl += `&iv_module=http%3A%2F%2F`
                        + `${config.ip}%3A${config.port}%2Fiv_module.swf`;
                    }
                    if(watch_url.includes("2012.swf")) {
                        let modulePrefix = `http://${config.ip}:${config.port}/alt-swf/modules/`
                        let args = {
                            "BASE_YT_URL": `http://${config.ip}:${config.port}/`,
                            "iv3_module": `${modulePrefix}2012_iv3_module-vfl7CyC10.swf`,
                            "cc3_module": `${modulePrefix}2012_subtitles3_module-vflX-PxNh.swf`,
                            "cc_load_policy": "1",
                            "iv_load_policy": "1"
                        }
                        let argsMerged = ""
                        for(let a in args) {
                            argsMerged += "&" + a + "=" + args[a]
                        }
                        flashUrl += argsMerged;
                    }
                    if(watch_url.includes("cps2.swf")) {
                        flashUrl += `&BASE_YT_URL=http://${config.ip}:${config.port}/`;
                    }
                    code = code.replace(
                        "<!--yt2009_player-->",
                        templates.flashObject(flashUrl)
                    )
                    code = code.replace(
                        `//yt2009-f-custom-player`,
                        `var customPlayerUrl = "${watch_url}";
                        var customPlayerArg = "${watch_arg}";
                        var baseUrlSetting = "http://${config.ip}:${config.port}/";
                        var currentVideo = "${video.id}";`
                    )
                }

                // playnav share link
                code = code.replace(
                    `playnav_share_short_link`,
                    `http://youtu.be/${video.id}`
                )
            } else {
                // no videos
                code = code.replace(
                    `id="playnav-body"`, `id="playnav-body" class="hid"`
                )
                code = code.replace(
                    `id="playnav-navbar"`, `id="playnav-navbar" class="hid"`
                )
                code = code.replace(
                    `id="playnav-navbar-toggle"`,
                    `id="playnav-navbar-toggle" class="hid"`
                )
                code = code.replace(
                    `<div id="playnav-navbar"`,
                    `<div style="float:left;padding-top: 1.2em" class="inner-box">
                ${yt2009utils.xss(channelName)} has no videos available.</div><div id="playnav-navbar"`
                )
                code = code.replace(
                    `//[yt2009-hook-no-videos]`,
                    `$("#channel-body").style.height = window.innerHeight - 78 + "px"`
                )
                code = code.replace(
                    `yt2009_channel_comment_count`,
                    channelCommentCount
                )
                code = code.replace(
                    `<!--yt2009_no_comments-->`,
                    `<div class="alignC">There are no comments for this user.</div>`
                )

                if(!wayback_settings.includes("comments")) {
                    if(devTimings) {
                        let progress = `${stepsTaken}/${stepsRequiredToCallback}`
                        console.log(`videos rendererd (${progress})`, time)
                    }
                    stepsTaken++;
                    setTimeout(function() {
                        if(stepsRequiredToCallback == stepsTaken) {
                            try {callback(code)}catch(error) {}
                        }
                    }, 100)
                }
            }
        }

        if(!flags.includes("only_old")) {
            videosRender();
        }

        /*
        =======
        login_simulate
        =======
        */
        let returnNoLang = req.headers.cookie.includes("lang=") || req.query.hl || false
        code = require("./yt2009loginsimulate")(flags, code, returnNoLang)

        /*
        =======
        fixups for f_mode
        =======
        */
        if(flashMode) {
            code = code.replace(`<!DOCTYPE html>`, templates.html4)
            code = code.replace(
                `id="playnav-player" class="playnav-player-container"`,
                `id="playnav-player" class="playnav-mvlf9xls playnav-player-container"`
            )
            code = code.replace(
                `><span style="display: block;">Search`,
                ` style="width: 40px;"><span>Search`
            )
            code = code.replace(
                `onclick="document.searchForm.submit();"`,
                `onclick="document.searchForm.submit();" style="width: 40px;"`
            )
            code = code.replace(
                `<!--yt2009_f-->`,
                `<script src="/assets/site-assets/f_script.js"></script>`
            )
            code = code.replace(
                `<script src="/assets/site-assets/channelpage.js"></script>`,
                ``
            )
            code = code.replace(
                `<!--yt2009_style_fixes_f-->`,
                `<link rel="stylesheet" href="/assets/site-assets/f.css">`
            )
            if(req.headers["user-agent"].includes("MSIE")) {
                code = code.split(`playnav-video selected`).join(`playnav-video`)
            }
        }

        /*
        =======
        data.properties
        =======
        */
        let properties_html = ``
        let swapTable = {
            "name": "lang_channel_field_name",
            "subscribers": "lang_channel_subscribers",
            "description": "lang_channel_field_description"
        }
        for(let p in data.properties) {
            let p_uppercase = yt2009utils.firstUppercase(p)
            let value = data.properties[p]
            if(p == "name") {
                value = yt2009utils.xss(value)
            }
            let valueMarkup = yt2009utils.markupDescription(value)

            properties_html += templates.channelProperty(
                swapTable[p], valueMarkup
            )
        }
        if(!wayback_settings.includes("fields")) {
            code = code.replace(
                "<!--yt2009_properties-->", properties_html
            )
        }

        /*
        =======
        exp_friends // merged
        =======
        */
        let subscriptions_count = 0;
        let friends_count = 0;
        if(data.friends && !wayback_settings.includes("sections")) {
            let friends = data.friends
            let subscriptions_html = ``
            let friends_html = ``
            for(let list in friends) {
                if(list == "Subscriptions") {
                    friends[list].splice(0, 6).forEach(sub => {
                        let url = sub.url
                        if(!url.startsWith("/c/")
                        && !url.startsWith("/channel/")
                        && !url.startsWith("/user/")) {
                            url = "/channel/" + sub.id
                        }
                        let name = yt2009utils.textFlags(sub.name, flags, url)
                        subscriptions_html += templates.channelUserPeep(
                            name,
                            url,
                            yt2009utils.saveAvatar(sub.avatar),
                            false
                        )
                        subscriptions_count++
                    })
                } else {
                    friends[list].splice(0, 12).forEach(friend => {
                        let url = friend.url
                        if(!url.startsWith("/c/")
                        && !url.startsWith("/channel/")
                        && !url.startsWith("/user/")) {
                            url = "/channel/" + friend.id
                        }
                        let name = yt2009utils.textFlags(friend.name, flags, url)
                        friends_html += templates.channelUserPeep(
                            name,
                            url,
                            yt2009utils.saveAvatar(friend.avatar),
                            true
                        )
                        friends_count++
                    })
                }
            }

            code = code.replace(`<!--yt2009_subs-->`, subscriptions_html)
            code = code.replace(`<!--yt2009_default_friends-->`, friends_html)

            if(friends_html == "") {
                code = code.replace(
                    `yt2009-default-friends-mark`,
                    `yt2009-default-friends-mark hid`
                )
            }
            if(subscriptions_html == "") {
                code = code.replace(
                    `yt2009-subscriptions-mark`,
                    `yt2009-subscriptions-mark hid`
                )
            }
        }
        code = code.replace("yt2009_subscriptions_count", subscriptions_count)
        code = code.replace("yt2009_friends_count", friends_count)

        /*
        =======
        exp_playlists // merged
        =======
        */
        let all_scrollbox_playlists_html = templates.allScrollboxPlaylistHead
        let playlists_scrollbox_html = templates.playlistScrollboxHead
        let savedPlaylists = n_impl_yt2009channelcache.read("playlist")[data.id]
        if(savedPlaylists && savedPlaylists.length > 0) {
            let playlists = n_impl_yt2009channelcache.read("playlist")[data.id]

            // "all" scrollbox playlists
            JSON.parse(JSON.stringify(playlists)).splice(0, 5).forEach(playlist => {
                all_scrollbox_playlists_html += templates.playnavPlaylist(
                    playlist, req.protocol, true
                )
            })
            all_scrollbox_playlists_html += templates.allScrollboxPlaylistEnd
            code = code.replace(
                "<!--yt2009_all_scrollbox_playlists-->",
                all_scrollbox_playlists_html
            )

            // playlists scrollbox
            JSON.parse(JSON.stringify(playlists)).forEach(playlist => {
                if(playlist.name == "Favorites") {
                    code = code.replace(`yt2009_favorites_remove_end-->`, "")
                    code = code.replace(
                        `<!--yt2009_favorites_remove_start`, ""
                    )
                    code = code.replace(
                        `yt2009_favorites_id_value`, playlist.id
                    )
                }
                playlists_scrollbox_html += templates.playnavPlaylist(
                    playlist, req.protocol, true
                )
            })
            playlists_scrollbox_html += templates.playlistScrollboxEnd

            // show playlist btn
            code = code.replace(`<!--yt2009_playlists_remove_start`, "")
            code = code.replace(`yt2009_playlists_remove_end-->`, "")
            code = code.replace(
                "<!--yt2009_playlists_scrollbox-->",
                playlists_scrollbox_html
            )
        }
        
        /*
        =======
        live videos
        =======
        */
        if(data.liveVideos && data.liveVideos.length >= 1 && !flashMode
        && (!flags || !flags.includes("no_live"))) {
            let liveScrollbox = templates.liveScrollboxHead
            let i = 1;
            data.liveVideos.forEach(vid => {
                liveScrollbox += templates.playnavVideo(
                    vid, i, "", "", "0", req.protocol, true
                )
                i++
            })
            liveScrollbox += templates.liveScrollboxEnd
            code = code.replace(`<!--yt2009_live_remove_start`, "")
            code = code.replace(`yt2009_live_remove_end-->`, "")
            code = code.replace(
                "<!--yt2009_live_scrollbox-->",
                liveScrollbox
            )
        }

        /*
        ========
        community posts as recent activity
        ========
        */
        if(data.communityPosts && data.communityPosts.length >= 1
        && (!flags || !flags.includes("no_community"))) {
            let posts = data.communityPosts.slice(0,4)
            let activityTab = templates.recentActivityHead
            let i = 0;
            posts.forEach(p => {
                activityTab += templates.recentActivityPost(p, i, req)
                i++
            })
            activityTab += templates.recentActivityEnd
            code = code.replace(
                `<!--yt2009_recentslot-->`,
                activityTab
            )
        }

        /*
        =======
        only_old
        =======
        */
        let onlyOldVideos = []
        if(flags.includes("only_old")) {
            if(data.videos.length <= 0) {
                videosRender()
                return;
            }
            stepsRequiredToCallback++;
            let only_old = yt2009search.handle_only_old(flags)
            let query = `"${data.name}" ${only_old}`
            yt2009search.get_search(query, flags, "", (results => {
                // throw actual results into data.videos
                // they use the same value names!! no parsing necessary
                results.forEach(result => {
                    if(result.type == "video"
                    && (data.name.includes(
                        result.author_name.split(" ").join("")
                    ) || data.name == result.author_name)) {
                        onlyOldVideos.push(result)
                    }
                })
                // main and render
                videosSource = onlyOldVideos;
                // if no videos with only_old and at least one without it,
                // use default
                if(!onlyOldVideos[0] && data.videos[0]) {
                    videosSource = data.videos;
                }
                // get comments for vid
                if(onlyOldVideos[0]
                && !saved_channel_comments[onlyOldVideos[0].id]) {
                    let id = onlyOldVideos[0].id
                    yt2009html.get_video_comments(id, (comments) => {
                        saved_channel_comments[id] = comments.slice();
                        videosRender();
                        if(devTimings) {
                            let progress = `${stepsTaken}/${stepsRequiredToCallback}`
                            console.log(`only_old (w comments) (${progress})`, time)
                        }
                        stepsTaken++
                        if(stepsTaken >= stepsRequiredToCallback) {
                            try{callback(code)}catch(error){}
                        }
                    })
                } else {
                    videosRender();
                    if(devTimings) {
                        let progress = `${stepsTaken}/${stepsRequiredToCallback}`
                        console.log(`only_old (n comments) (${progress})`, time)
                    }
                    stepsTaken++
                    if(stepsTaken >= stepsRequiredToCallback) {
                        try{callback(code)}catch(error){}
                    }
                }
                
            }), yt2009utils.get_used_token(req), false)
        }

        /*
        =======
        wayback_features render section
        =======
        */
        function wayback_render_section(
            sectionName, sectionArray, fullHTML, useSixColumn
        ) {
            let html = ``
            if(fullHTML) {
                html = templates.channelSectionHTMLBegin(sectionName)
            }
            let realCount = 0
            sectionArray.forEach(user => {
                if(user.type == "count") {
                    realCount = user.count;
                    return;
                }
                html += `\n${templates.channelUserPeep(
                    user.link.split("/")[user.link.split("/").length - 1],
                    user.link.split("youtube.com")[1],
                    user.icon,
                    useSixColumn
                )}`
            })
            if(fullHTML) {
                html += `\n${templates.channelSectionHTMLEnd()}`
            }
            if(realCount !== 0) {
                code = code.split(`yt2009_${sectionName}_count`, realCount)
            } else {
                code = code.split(`(yt2009_${sectionName}_count)`, ``)
            }

            return html;
        }

        /*
        =======
        wayback_features
        =======
        */
        if(flags.includes("wayback_features")
        && channelUrl.includes("user/")) {
            wayback_channel.read(
                channelUrl,
                (waybackData => {

                /*
                =======
                basic
                =======
                */
                if(wayback_settings.includes("basic")) {
                    if(waybackData.avatarUrl) {
                        code = code.split(`yt2009_channel_avatar`)
                                    .join(waybackData.avatarUrl)
                    } else {
                        code = code.split("yt2009_channel_avatar")
                                   .join(channelAvatar)
                    }
                    
                    
                    let customCSS = ""
                    if(typeof(waybackData.customCSS) == "string") {
                        customCSS = waybackData.customCSS
                    }

                    let innerBoxColor = ""
                    if(customCSS.includes(".inner-box-colors { background")) {
                        try {
                            innerBoxColor = customCSS.split(
                                            ".inner-box-colors { background")[1]
                                            .split("}")[0].split(":")[1].trim()
                        }
                        catch(error) {}
                    }

                    code = code.replace(
                        `<!--yt2009_wayback_channel_custom_css-->`,
                        `<style type="text/css"
                id="channel-theme-css"
                name="channel-theme-css">
                        ${customCSS}
    
    
                        /*yt2009*/
                        .panel-tab-indicator-cell svg,
                        .playnav-video.selected{
                            fill: ${innerBoxColor || "none"};
                            background: transparent;
                        }
                        </style>`
                    )
                }

                
                /*
                =======
                fields
                =======
                */
                if(wayback_settings.includes("fields")
                && waybackData.fields.length > 0) {
                    let fieldsHTML = ``
                    waybackData.fields.forEach(field => {
                        if(field.value.includes("float:left")
                        || field.value.includes("float: left")) {
                            fieldsHTML += `
                            <div class="show_info outer-box-bg-as-border">
                                ${field.value}
                            </div>`
                        } else {
                            fieldsHTML += `
                            <div class="show_info outer-box-bg-as-border">
                                <div style="float:left;font-weight:bold;">${
                                    field.name
                                }</div>
                                <div style="float:right;" id="profile_show_${
                                    field.name.replace(/[^a-zA-Z]/g, "")
                                                .toLowerCase()
                                }">${field.value}</div>
                                <div class="cb"></div>
                            </div>`
                        }
                    })
    
                    code = code.replace(
                        `<!--yt2009_wayback_properties-->`,
                        fieldsHTML
                    )
                }

                /*
                =======
                sections
                =======
                */
                if(wayback_settings.includes("sections")
                && (waybackData.friends.length > 0
                || waybackData.subscribers.length > 0
                || waybackData.subscriptions.length > 0)) {
                    // slots determine where on the page the section
                    // is displayed.
                    //
                    // slot1 - left
                    // slot2 - right

                    // friends
                    if(waybackData.friends
                    && waybackData.friends.length > 0) {
                        let useSixColumnRender = false;
                        let slot = "yt2009_friends_slot1" // slot1
                        if(waybackData.friends.length >= 6) {
                            useSixColumnRender = true;
                            slot = "yt2009_friends_slot2"
                        }
                        code = code.replace(
                            `<!--${slot}-->`,
                            wayback_render_section(
                                "friends",
                                waybackData.friends,
                                true,
                                useSixColumnRender
                            )
                        )
                        code = code.replace(
                            ` (yt2009_friends_count)`,
                            ``
                        )
                        code = code.replace(
                            `yt2009-default-friends-mark`,
                            `yt2009-default-friends-mark hid`
                        )
                    } else {
                        code = code.replace(
                            `yt2009-friends-mark`,
                            `yt2009-friends-mark hid`
                        )
                    }
    
                    // subscriptions
                    if(waybackData.subscriptions
                    && waybackData.subscriptions.length > 0) {
                        code = code.replace(
                            `<!--yt2009_subs-->`,
                            wayback_render_section(
                                "subscriptions",
                                waybackData.subscriptions,
                                false
                            )
                        )
                        code = code.split(
                            ` (yt2009_subscriptions_count)`
                        ).join("")
                    } else {
                        code = code.replace(
                            `yt2009-subscriptions-mark`,
                            `yt2009-subscriptions-mark hid`
                        )
                    }
    
                    // subscribers
                    if(waybackData.subscribers
                    && waybackData.subscribers.length > 0) {
                        let useSixColumnRender = false;
                        let slot = "yt2009_wayback_subscribers_slot1"
                        if(waybackData.subscribers.length >= 6) {
                            slot = "yt2009_wayback_subscribers_slot2"
                            useSixColumnRender = true;
                        }
                        code = code.replace(
                            `<!--${slot}-->`,
                            wayback_render_section(
                                "subscribers",
                                waybackData.subscribers,
                                true,
                                useSixColumnRender
                            )
                        )
                        code = code.replace(
                            ` (yt2009_subscribers_count)`,
                            ``
                        )
                    }
                }

                /*
                =======
                comments
                =======
                */
                if(wayback_settings.includes("comments")
                && waybackData.comments
                && waybackData.comments.length > 0) {
                    let commentsHTML = ``
                    waybackData.comments.forEach(comment => {
                        if(commentsHTML.includes(comment.content)) return;
                        commentsHTML += templates.channelComment(
                            "/" + comment.link,
                            comment.icon,
                            comment.name,
                            comment.time.replace("(", "").replace(")", ""),
                            comment.content
                        )
                    })
                    code = code.replace(
                        `<!--yt2009_comments-->`,
                        commentsHTML
                    )
                    code = code.replace(
                        `(yt2009_channel_comment_count)`,
                        ""
                    )
                }


                stepsTaken++
                if(devTimings) {
                    let progress = `${stepsTaken}/${stepsRequiredToCallback}`
                    console.log(`wayback full (${progress})`, time)
                }
                if(stepsRequiredToCallback == stepsTaken) {
                    try{callback(code)}catch(error){}
                }
            }), (req.query.resetcache == 1 || req.query.resetwayback == 1))
        }

        
        /*
        =======
        author_old_avatar
        =======
        */
        function setChannelIcon() {
            code = code.split("yt2009_channel_avatar").join(channelAvatar)
        }
        if(flags.includes("author_old_avatar")) {
            stepsRequiredToCallback++
            let id = data.id.replace("UC", "")
            let avatarUrl = `https://i3.ytimg.com/u/${id}/channel_icon.jpg`
            let fname = __dirname + "/../assets/" + id + "_old_avatar.jpg"
            let oldChannelIconPath = "/assets/" + id + "_old_avatar.jpg"

            // callback at the top
            function markAsDone() {
                stepsTaken++
                if(devTimings) {
                    let progress = `${stepsTaken}/${stepsRequiredToCallback}`
                    console.log(`author_old_avatar (${progress})`, time)
                }
                if(stepsRequiredToCallback <= stepsTaken) {
                    try{callback(code)}catch(error){console.log(error)}
                }
            }
            // exists and not there = set default
            if(fs.existsSync(fname)
            && fs.statSync(fname).size < 10) {
                setChannelIcon()
                markAsDone()
            }
            // exists and there
            else if(fs.existsSync(fname)
            && fs.statSync(fname).size > 10) {
                channelAvatar = oldChannelIconPath
                setChannelIcon()
                markAsDone()
            }
            // doesn't exist
            else {
                fetch(avatarUrl, {
                    "headers": yt2009constants.headers
                }).then(r => {
                    if(r.status !== 404) {
                        r.buffer().then(buffer => {
                            fs.writeFileSync(fname, buffer)
                            channelAvatar = oldChannelIconPath
                            setChannelIcon()
                            markAsDone()
                        })
                    } else {
                        // no old icon, use current
                        fs.writeFileSync(fname, "")
                        setChannelIcon()
                        markAsDone()
                    }
                }).catch(e => {
                    // error pulling old icon, use current
                    fs.writeFileSync(fname, "")
                    setChannelIcon()
                    markAsDone()
                })
            }
        }


        /*
        =======
        banners
        =======
        */
        let cId = data.id.replace("UC", "")
        let oBg = false;

        // wait for dominant color complete
        let dominantColor = []
        function waitDominantColor(callback) {
            let z = setInterval(() => {
                let utd = n_impl_yt2009channelcache.read("main")[data.id]
                if(utd.dominant_color) {
                    dominantColor = utd.dominant_color;
                    clearInterval(z)
                    callback()
                }
            }, 100)
        }

        // wait for legacy img tryout complete
        if(!flags.includes("disable_old_banners")) {
            let y = setInterval(() => {
                let utd = n_impl_yt2009channelcache.read("main")[data.id]

                if(!utd.oldTryoutComplete) return;

                oBg = utd.obgObject

                clearInterval(y)

                // apply old background if used
                if(utd.oldBackgroundFile) {
                    let css = `#channel-body {
                        background-image: url("/assets/${cId}_background.jpg")
                    }
                    `
                    code = code.replace(`/*yt2009_custom_bg*/`, css)
                }

                if(utd.oldBannerFile) {
                    code = code.replace(
                        `<!--yt2009_banner-->`,
                        templates.banner(`/assets/${cId}_banner.jpg`)
                    )
                    dominant_color(utd.oldBannerFile, (color) => {
                        applyColor(color)
                    })
                } else if(data.bannerUrl) {
                    code = code.replace(
                        `<!--yt2009_banner-->`,
                        templates.banner(`/assets/${cId}_uniq_banner.jpg`)
                    )
                    // poll dominant_color
                    waitDominantColor(() => {
                        applyColor(dominantColor)
                    })
                } else {
                    code = code.split(`yt2009_main_bg`).join(
                        yt2009utils.createRgb([200, 200, 200])
                    )
                    code = code.split(`yt2009_darker_bg`).join(
                        yt2009utils.createRgb([135, 135, 135])
                    )
                    code = code.split("yt2009_text_color").join("black")
                    code = code.split("yt2009_black").join("icon_black")
                    ac()
                }
            }, 100)
        } else {
            if(devTimings) {
                console.log("skipping wait for banner")
            }
            if(data.newBanner) {
                code = code.replace(
                    `<!--yt2009_banner-->`,
                    templates.banner(`/assets/${cId}_uniq_banner.jpg`)
                )
                // poll dominant_color
                waitDominantColor(() => {
                    applyColor(dominantColor)
                })
            } else {
                code = code.split(`yt2009_main_bg`).join(
                    yt2009utils.createRgb([200, 200, 200])
                )
                code = code.split(`yt2009_darker_bg`).join(
                    yt2009utils.createRgb([135, 135, 135])
                )
                code = code.split("yt2009_text_color").join("black")
                code = code.split("yt2009_black").join("icon_black")
                ac()
            }
        }

        function applyColor(color) {
            code = code.split(`yt2009_main_bg`).join(
                oBg && oBg.primaryBg
                ? oBg.primaryBg : yt2009utils.createRgb(color)
            )
            let brighterBg = [
                color[0] + 10, color[1] + 10, color[2] + 10
            ]
            code = code.split(`yt2009_darker_bg`).join(
                oBg && oBg.secondaryBg
                ? oBg.secondaryBg : yt2009utils.createRgb(brighterBg)
            )
            if(brighterBg[0] + brighterBg[1] >= 340
            || (oBg && oBg.blackText)) {
                code = code.split("yt2009_text_color").join("black")
                code = code.split("yt2009_black").join("icon_black")
            } else {
                code = code.split("yt2009_text_color").join("white")
            }
            // callback
            ac()
        }
        
        // callback
        function ac() {
            stepsTaken++

            if(devTimings) {
                let progress = `${stepsTaken}/${stepsRequiredToCallback}`
                console.log(`banners/avatars sorted (${progress})`, time)
            }

            if(stepsRequiredToCallback <= stepsTaken) {
                try{callback(code)}catch(error){console.log(error)}
            }
        }

        if(stepsRequiredToCallback <= stepsTaken) {
            try{callback(code)}catch(error){console.log(error)}
        }
    },

    "playnav_get_comments": function(req, res) {
        if(!yt2009utils.isAuthorized(req)) {
            res.send("")
            return;
        }

        function parse_comments_html(data) {
            let result = `<h2>Comments</h2>
            <div class="playnav_comments">`
            data.forEach(comment => {
                if(comment.continuation) return;
                result += `
            <div class="watch-comment-entry">
                <div class="watch-comment-head">
                    <div class="watch-comment-info">
                        <a class="watch-comment-auth" href="${comment.authorUrl}" rel="nofollow">${comment.authorName}</a>
                        <span class="watch-comment-time"> (${comment.time}) </span>
                    </div>
                    <div class="clearL"></div>
                </div>
                <div>
                    <div class="watch-comment-body">
                        <div>
                            ${comment.content}
                        </div>
                    </div>
                    <div></div>
                </div>
            </div>`
            })

            result += `
            </div>`

            return result;
        }

        if(saved_channel_comments[req.headers.id]) {
            res.send(parse_comments_html(saved_channel_comments[req.headers.id]))
        } else {
            yt2009html.get_video_comments(req.headers.id, (comments) => {
                saved_channel_comments[req.headers.id] = comments.slice();
                res.send(parse_comments_html(comments))
            })
        }
    },

    "get_saved_channels": function() {
        return featured_channels;
    },

    "get_cache": n_impl_yt2009channelcache,

    "fill_videocount": function(url, callback) {
        // add video count to user caches without them
        userid_cache.read(url, (id) => {
            // clean fetch the channel
            fetch(`https://www.youtube.com/youtubei/v1/browse?key=${
                yt2009html.get_api_key()
            }`, {
                "headers": yt2009constants.headers,
                "referrer": "https://www.youtube.com/",
                "referrerPolicy": "strict-origin-when-cross-origin",
                "body": JSON.stringify({
                    "context": yt2009constants.cached_innertube_context,
                    "browseId": id
                }),
                "method": "POST",
                "mode": "cors"
            }).then(r => {r.json().then(r => {
                let videoCount = ""
                if(r.header.pageHeaderRenderer) {
                    try {
                        let vm = r.header.pageHeaderRenderer
                                  .content.pageHeaderViewModel;
                        vm.metadata.contentMetadataViewModel
                          .metadataRows.forEach(r => {
                            if(r.metadataParts) {
                                r.metadataParts.forEach(mp => {
                                    if(mp.text && mp.text.content.includes(" videos")) {
                                        videoCount = mp.text.content.split(" ")[0]
                                    }
                                })
                            }
                        })
                    }
                    catch(error) {console.log(error)}
                } else if(r.header.c4TabbedHeaderRenderer) {
                    try {
                        videoCount = r.header.c4TabbedHeaderRenderer
                                      .videosCountText.runs[0].text
                    }
                    catch(error) {} 
                }
                if(n_impl_yt2009channelcache.read("main")[id]
                && !n_impl_yt2009channelcache.read("main")[id].videoCount
                && videoCount.length !== 0) {
                    let newCache = JSON.parse(
                        JSON.stringify(n_impl_yt2009channelcache.read("main")[id])
                    )
                    newCache.videoCount = videoCount
                    n_impl_yt2009channelcache.write("main", id, newCache)
                }

                callback(videoCount)
            })})
        })
    },

    "autoUserHandle": function(req, res, flags) {
        let url = req.originalUrl
        let userHandle = ""
        if(url.includes("/user/")) {
            // already a /user/ url, handle as normal
            this.main(req, res, flags)
            return;
        }

        // get user id
        let userId = ""
        if(url.includes("/channel/")) {
            userId = url.split("/channel/")[1].split("?")[0].split("#")[0]
            getUserHandle()
        } else {
            userid_cache.read(url, (id) => {
                userId = id;
                getUserHandle()
            })
        }

        // then get the user's handle to try to get /user/ with it
        function getUserHandle() {
            if(url.includes("@")) {
                userHandle = url.split("@")[1].split("?")[0].split("#")[0]
                compare()
            } else {
                // try to get handle from cache
                if((n_impl_yt2009channelcache.read("main")[url]
                &&  n_impl_yt2009channelcache.read("main")[url].handle)
                || (n_impl_yt2009channelcache.read("main")[userId]
                &&  n_impl_yt2009channelcache.read("main")[userId].handle)) {
                    let cache = n_impl_yt2009channelcache.read("main")
                    cache = cache[url] || cache[userId]
                    userHandle = cache.handle.replace("@", "")
                    compare()
                    return;
                }
                // clean fetch for handle
                else {
                    fetch(`https://www.youtube.com/youtubei/v1/browse?key=${
                        yt2009html.get_api_key()
                    }`, {
                        "headers": yt2009constants.headers,
                        "referrer": "https://www.youtube.com/",
                        "referrerPolicy": "strict-origin-when-cross-origin",
                        "body": JSON.stringify({
                            "context": yt2009constants.cached_innertube_context,
                            "browseId": userId
                        }),
                        "method": "POST",
                        "mode": "cors"
                    }).then(r => {r.json().then(r => {
                        let useViewmodelParse = false;
                        if(r.header.pageHeaderRenderer) {
                            useViewmodelParse = true
                        }
                        if(useViewmodelParse) {
                            let metadataParts = []
                            r.header.pageHeaderRenderer.content.pageHeaderViewModel
                            .metadata.contentMetadataViewModel.metadataRows[0].metadataParts
                            .forEach(m => {
                                metadataParts.push(m.text.content)
                            })

                            metadataParts.forEach(m => {
                                // handle
                                if(m.startsWith("@")) {
                                    userHandle = m;
                                }
                            })
                        } else if(r.header.c4TabbedHeaderRenderer.channelHandleText) {
                            userHandle = r.header.c4TabbedHeaderRenderer
                                          .channelHandleText.runs[0].text
                        }
                        compare()
                    })})
                }
            }
        }

        function compare() {
            if(!userHandle) {
                require("./yt2009channels").main(req, res, flags, false)
                return;
            }
            userHandle = userHandle.replace("@", "")
            userid_cache.read(`/user/${userHandle}`, (id) => {
                if(userId == id) {
                    // the same ids, redirect to /user/!!!
                    res.redirect(`/user/${userHandle}`)
                } else {
                    // nah :(, continue with the request as normal
                    require("./yt2009channels").main(req, res, flags, false)
                }
            })
        }
    },

    "get_id": function(link, callback) {
        link = link.split("/")
        link.forEach(p => {
            if(p.startsWith("UC")) {
                link = "channel/" + p
            }
            if(p.startsWith("@")) {
                link = p
            }
            if(p == "user" || p == "c") {
                link = link[link.indexOf(p) + 1]
            } 
        })
        userid_cache.read(link, (id) => {
            // clean fetch the channel
            callback(id)
        })
    },

    "get_direct_by_chipparam": function(chipParam, channelId, callback) {
        let videos = []
        function createVideosFromChip(chip) {
            chip.forEach(video => {
                if(video.richItemRenderer || video.gridVideoRenderer) {
                    video = (video.richItemRenderer || video.gridVideoRenderer)
                            .content.videoRenderer

                     let badges = []
                     if(video.badges) {
                        try {
                            video.badges.forEach(badge => {
                                if(badge.metadataBadgeRenderer) {
                                    badge = badge.metadataBadgeRenderer
                                    badges.push(badge.style)
                                }
                            })
                        }
                        catch(error){}
                    }
                    videos.push({
                        "id": video.videoId,
                        "title": video.title.runs[0].text,
                        "views": (video.viewCountText
                              || {"simpleText": "0 views"}).simpleText,
                        "upload": (video.publishedTimeText || {"simpleText": "?"})
                                  .simpleText,
                        "thumbnail": "http://i.ytimg.com/vi/"
                                    + video.videoId
                                    + "/hqdefault.jpg",
                        "length": (video.lengthText || {"simpleText": "00:00"})
                                  .simpleText,
                        "badges": badges
                    })
                }
            })
            
            callback(videos)
        }

        const popularVids = require("./proto/popularVidsChip_pb")
        let vidsContinuation = new popularVids.vidsChip()
        let msg = new popularVids.vidsChip.nestedMsg1()
        msg.setChannelid(channelId)
        msg.setChipparam(chipParam)
        vidsContinuation.addMsg(msg)
        let chip = encodeURIComponent(Buffer.from(
            vidsContinuation.serializeBinary()
        ).toString("base64"))

        fetch(`https://www.youtube.com/youtubei/v1/browse?key=${
            yt2009html.get_api_key()
        }`, {
            "headers": yt2009constants.headers,
            "referrer": "https://www.youtube.com/",
            "referrerPolicy": "strict-origin-when-cross-origin",
            "body": JSON.stringify({
                "context": yt2009constants.cached_innertube_context,
                "continuation": chip
            }),
            "method": "POST",
            "mode": "cors"
        }).then(r => {r.json().then(r => {
            if(!r.onResponseReceivedActions) {
                createVideosFromChip([])
                return;
            }
            r.onResponseReceivedActions.forEach(action => {
                if(action.reloadContinuationItemsCommand.slot
                == "RELOAD_CONTINUATION_SLOT_BODY") {
                    videosTabAvailable = true
                    createVideosFromChip(
                        action.reloadContinuationItemsCommand
                              .continuationItems
                    )
                }
            })
        })})
    },

    "tryout_legacy_images": function(cId, callback) {
        cId = cId.replace("UC", "")
        let data = {
            "oldTryoutComplete": false,
            "oldBannerFile": false,
            "oldBackgroundFile": false,
            "obgObject": false
        }

        function c() {
            // done
            data.oldTryoutComplete = true;
            callback(data)
        }

        let banner = `https://i3.ytimg.com/u/${cId}/profile_header.jpg`
        let oBg = overrideBgs[cId]

        data.obgObject = oBg;

        let bgsTry = [
            `https://i3.ytimg.com/bg/${cId}/${oBg ? oBg.imageId : "101"}.jpg`,
            `https://i3.ytimg.com/bg/${cId}/default.jpg`
        ]
        let bgsTryIndex = 0;
        let bgfile = __dirname + "/../assets/" + cId + "_background.jpg"

        let fetchesRequired = 2;
        let fetchesCompleted = 0;

        function mc() { //markcomplete
            fetchesCompleted++
            if(fetchesCompleted >= fetchesRequired) {
                c()
            }
        }

        // channel background
        function getOldBg() {
            // download old background if used
            let bg = bgsTry[bgsTryIndex]
            if(!fs.existsSync(bgfile)) {
                if(devTimings) {
                    console.log(`old bg download attempt start`)
                }
                fetch(bg, {
                    "headers": yt2009constants.headers
                }).then(r => {
                    if(r.status !== 404) {
                        r.buffer().then(buffer => {
                            fs.writeFileSync(bgfile, buffer)
                            data.oldBackgroundFile = bgfile
                            if(devTimings) {
                                console.log(`old bg downloaded`)
                            }
                            mc()
                        })
                    } else {
                        bgsTryIndex++
                        if(bgsTry.length <= bgsTryIndex) {
                            mc()
                        } else {
                            getOldBg()
                        }
                        
                    }
                }).catch(e => {
                    // bg pull fail, use default
                    if(devTimings) {
                        console.log(`old bg not working`)
                    }
                    mc()
                    console.log(e)
                })
            } else if(fs.existsSync(bgfile) && fs.statSync(bgfile).size > 5) {
                // use downloaded background
                if(devTimings) {
                    console.log(`old bg already downloaded, using`)
                }
                data.oldBackgroundFile = bgfile
                mc()
            } else {
                // just callback

                if(devTimings) {
                    console.log(`old bg different case, using modern`)
                }

                mc()
            }
        }
        getOldBg()

        // top banner
        let b = __dirname + "/../assets/" + cId + "_banner.jpg"
        if(!fs.existsSync(b)) {
            if(devTimings) {
                console.log(`old top banner attempt start`)
            }
            // try to get old top banner
            fetch(banner, {
                "headers": yt2009constants.headers
            }).then(r => {
                if(r.status !== 404) {
                    // old banner exists, save
                    r.buffer().then(buffer => {
                        fs.writeFileSync(b, buffer)
                        data.oldBannerFile = b;
                        
                        mc()

                        if(devTimings) {
                            console.log(`old banner downloaded`)
                        }
                    })
                } else {
                    mc()
                }
            }).catch(e => {
                console.log(e)
            })
        } else {
            if(fs.statSync(b).size > 5
            && (!oBg || (oBg && !oBg.hideHeader))) {
                data.oldBannerFile = b
            }
            mc()
        }
    },
    
    "aboutChannel": function(cId, callback) {
        let metadata = {}
        fetch(`https://www.youtube.com/youtubei/v1/browse`, {
            "headers": yt2009constants.headers,
            "referrer": "https://www.youtube.com/",
            "referrerPolicy": "strict-origin-when-cross-origin",
            "body": JSON.stringify({
                "context": yt2009constants.cached_innertube_context,
                "browseId": cId,
                "params": "EgVhYm91dPIGBBICIgA%3D"
            }),
            "method": "POST",
            "mode": "cors"
        }).then(r => {r.json().then(r => {
            //fs.writeFileSync("./test.json", JSON.stringify(r))
            try {
                let mr = r.contents.twoColumnBrowseResultsRenderer.tabs[0]
                         .tabRenderer.content.sectionListRenderer.contents[0]
                         .channelAboutFullMetadataRenderer
                if(!mr || !mr.canonicalChannelUrl) {
                    mr = r.contents.twoColumnBrowseResultsRenderer.tabs[0]
                         .tabRenderer.content.sectionListRenderer.contents[0]
                         .itemSectionRenderer.contents[0]
                         .channelAboutFullMetadataRenderer
                }
                for(let p in mr) {
                    metadata[p] = mr[p]
                }
            }
            catch(error) {
                console.log("error at extract ful metadata", error)
            }
            try {
                let mr = r.metadata.channelMetadataRenderer
                for(let p in mr) {
                    metadata[p] = mr[p]
                }
            }
            catch(error) {
                console.log("error at extract part metadata", error)
            }

            callback(metadata)
        })})
    },

    "subCount": function(cId, callback) {
        if(n_impl_yt2009channelcache.read("main")[cId]
        && n_impl_yt2009channelcache.read("main")[cId].properties
        && n_impl_yt2009channelcache.read("main")[cId].properties.subscribers) {
            let subc = n_impl_yt2009channelcache.read("main")[cId]
                       .properties.subscribers;
            callback(yt2009utils.approxSubcount(subc.split(" ")[0]))
        } else {
            fetch(`https://www.youtube.com/youtubei/v1/browse`, {
                "headers": yt2009constants.headers,
                "referrer": "https://www.youtube.com/",
                "referrerPolicy": "strict-origin-when-cross-origin",
                "body": JSON.stringify({
                    "context": yt2009constants.cached_innertube_context,
                    "browseId": cId
                }),
                "method": "POST",
                "mode": "cors"
            }).then(r => {r.json().then(r => {
                this.parse_main_response(r, "", (data) => {
                    if(!data) {
                        callback("0")
                        return;
                    }

                    if(data.properties && data.properties.subscribers) {
                        let subc = data.properties.subscribers
                        callback(yt2009utils.approxSubcount(subc.split(" ")[0]))
                    } else {
                        callback("0")
                    }
                })
            })})
        }
    }
}