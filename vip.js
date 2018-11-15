var g_playlist = null;
var g_previous = [];
var g_previous_idx = 0;
var g_looping = false;
var g_shuffle = true;
var g_current_track = null;
var g_current_youtube = false;
var MAX_HISTORY = 10;

var scrubp = 0;
var is_dragging_scrubber = false;

var PLAYLISTS = {
    'VIP': 'https://vip.aersia.net/roster.xml',
    'Mellow': 'https://vip.aersia.net/roster-mellow.xml',
    'Source': 'https://vip.aersia.net/roster-source.xml',
    'Exiled': 'https://vip.aersia.net/roster-exiled.xml',
    'WAP': 'https://wap.aersia.net/roster.xml',
    'CPP': 'https://cpp.aersia.net/roster.xml',
};

var DEFAULT_PLAYLIST = 'VIP';
var player = null;

document.addEventListener('DOMContentLoaded', function () {
    var elPlayer = document.querySelector('.js-player');
    player = youtube({ el:elPlayer })
        .on('ready', function(event) {
            startPlayer();
        })
        .on('play', function(event) {
            if (g_current_youtube) {
                $('#btn-play i').removeClass ('fa-play');
                $('#btn-play i').addClass ('fa-pause');
            }
        })
        .on('pause', function(event) {
            if (g_current_youtube) {
                $('#btn-play i').removeClass ('fa-pause');
                $('#btn-play i').addClass ('fa-play');
            }
        })
        .on('ended', function(event) {
            playNextTrack();
        })
        .on('timeupdate', function(event) {
            if (isNaN (this.duration))
                return;
            if (!is_dragging_scrubber)
                $('#scrubber-progress').css('width', (this.currentTime / this.duration) * 100+'%');
            $('#time-current').text (formatTimecode (this.currentTime));
            $('#time-remaining').text (formatTimecode (this.duration - this.currentTime));
        });
});

function formatTimecode (seconds) {
    seconds = Math.floor (seconds);
    minutes = Math.floor (seconds / 60);
    seconds = seconds - (minutes * 60);
    minutes = "" + minutes;
    seconds = "" + seconds;

    if (minutes.length == 1)
        minutes = "0" + minutes;
    if (seconds.length == 1)
        seconds = "0" + seconds;

    return minutes + ":" + seconds;
}

// Creates an id for a track used in the location hash
function createTrackId (track) {
    var playlist = $('#select-playlist').val ();
    var track = track.creator + ' - ' + track.title;
    track = track.replace(/[^a-zA-Z0-9-]/g, '_');

    return encodeURIComponent (playlist) + ':' + track;
}

function parseTrackId (trackId) {
    var pieces = trackId.split (':');
    var playlist = '';
    var track = '';

    if (pieces.length < 2) {
        playlist = decodeURIComponent (trackId);
        track = '';
    } else {
        pieces.pop ();
        playlist = decodeURIComponent (pieces.join (':'));
        track = trackId;
    }

    if (!(playlist in PLAYLISTS))
        return null;

    return {
        playlist: playlist,
        track: track
    };
}

function parsePlaylist (playlistXML) {
    result = [];

    $(playlistXML).find ('playlist trackList > track').each (function () {
        track = {
            creator: $(this).find ('creator').text (),
            title: $(this).find ('title').text (),
            location: $(this).find ('location').text ()
        };

        track.location = track.location.replace("http:", "https:");

        result.push (track);
    });

    return result;
}

function playPreviousTrack () {
    if (g_playlist === null)
        return;

    if (g_shuffle) {
        if (g_previous_idx <= 0)
            g_previous_idx = 0;
        else
            g_previous_idx -= 1;
    } else {
        if (g_previous[g_previous_idx] <= 0) {
            g_previous[g_previous_idx] = g_playlist.length - 1;
        } else {
            g_previous[g_previous_idx] -= 1;
        }
    }

    playTrack (g_previous[g_previous_idx]);
}

function playNextTrack (trackId) {
    if (g_playlist === null)
            return;

    if (g_shuffle) {
        if (g_previous_idx >= (g_previous.length - 1)) {
            g_previous.push (trackId || Math.floor (Math.random () * g_playlist.length));
            g_previous_idx = g_previous.length - 1;
        } else {
            g_previous_idx += 1;
        }
    } else {
        if (trackId !== undefined) {
            g_previous[g_previous_idx] = trackId;
        } else if (g_previous[g_previous_idx] >= g_playlist.length - 1) {
            g_previous[g_previous_idx] = 0;
        } else {
            g_previous[g_previous_idx] += 1;
        }
    }

    while (g_previous.length > MAX_HISTORY) {
        g_previous.shift ();
        g_previous_idx -= 1;
    }

    playTrack (g_previous[g_previous_idx]);
}

function playTrack (trackid) {
    var track = g_playlist[trackid];

    $('#tracks-table .selected').removeClass ('selected');
    var trackelem = $('#tracks-table div').eq (trackid);
    trackelem.addClass ('selected');

    if (track.location.includes("youtube.com")) {
        // debugger;
        g_current_youtube = true;
        $('audio').trigger ('pause');
        player.src = track.location.substr(-11);
        player.play();
    } else {
        // window.location.hash = createTrackId (track);
        g_current_youtube = false;
        player.pause();
        $('audio').attr ('src', track.location);
        $('audio').trigger ('play');
    }

    $('html, body').stop ().animate ({
        scrollTop: trackelem.offset ().top - $('.control-bar').height ()
    }, 1000);
}

function loadNewPlaylist (playlist, track) {
    var playlistURL = PLAYLISTS[playlist];
    var selected_track = track;

    localStorage['playlist'] = playlist;
    $('#select-playlist').val (playlist);

    // Clear
    $('#tracks-table div').remove ();
    g_previous = [];
    g_previous_idx = 0;
    g_playlist = null;

    $.ajax({
        url: playlistURL,
        success: function (data) {
            // Parse track list
            g_playlist = parsePlaylist (data);

            // Build HTML table for track listing
            for (var i = 0; i < g_playlist.length; ++i) {
                var track = g_playlist[i];

                var row = $('<div>');
                row.text (track.creator + ' - ' + track.title);
                row.attr ('id', createTrackId (track));

                row.appendTo ('#tracks-table');
                (function (i) {
                    row.click (function () {
                        playNextTrack(i);
                    });
                }) (i);
            }

            // Select specified track if possible, or play random track if not.
            var elements = $('#tracks-table div').filter (function (idx, elem) {
                return elem.id == selected_track;
            });

            if (elements.length > 0) {
                elements[0].click ();
            } else {
                playNextTrack ();
            }
        }
    });
};

function playpause () {
    if (g_current_youtube) {
        if (player.paused)
            player.play();
        else
            player.pause();
    } else {
        if ($('audio').get (0).paused)
            $('audio').trigger ('play');
        else
            $('audio').trigger ('pause');
    }
}

function toggleLooping () {
    g_looping = !g_looping;
    $('audio').attr ('loop', g_looping);
    $('#btn-loop i').toggleClass('fa-times', g_looping);
    $('#btn-loop i').toggleClass('fa-repeat', !g_looping);
}

function toggleShuffle () {
    g_shuffle = !g_shuffle;
    g_previous = [g_previous[g_previous_idx]];
    g_previous_idx = 0;
    $('#btn-shuffle i').toggleClass('icon-off');
}

function populatePlaylistOptions () {
    for (var name in PLAYLISTS) {
        var option = $("<option>");
        option.val (name);
        option.text (name);

        $('#select-playlist').append (option);
    }
}

function startPlayer() {
    // Register Events
    $('audio').on ('pause', function () {
        if (!g_current_youtube) {
            $('#btn-play i').removeClass ('fa-pause');
            $('#btn-play i').addClass ('fa-play');
        }
    });

    $('audio').on ('play', function () {
        if (!g_current_youtube) {
            $('#btn-play i').removeClass ('fa-play');
            $('#btn-play i').addClass ('fa-pause');
        }
    });

    $('audio').on ('error', function () {
        playNextTrack ();
    });

    $('audio').on ('timeupdate', function () {
        if (isNaN (this.duration))
            return;
        if (!is_dragging_scrubber)
            $('#scrubber-progress').css('width', (this.currentTime / this.duration) * 100+'%');
        $('#time-current').text (formatTimecode (this.currentTime));
        $('#time-remaining').text (formatTimecode (this.duration - this.currentTime));
    });

    $('#time-bar').on('mousedown mouseup', function(e) {
        if (e.which == 1) {
            is_dragging_scrubber = true;
            var sc_w = $('#scrubber-track').outerWidth();
            var p = ((e.pageX - $('#scrubber-track').offset().left) / sc_w) * 100;
            $('#scrubber-progress').css('width', p+'%');
            scrubp = p;
            $(document).on('mousemove.scrubber-track', function(e) {
                sc_w = $('#scrubber-track').outerWidth();
                p = ((e.pageX - $('#scrubber-track').offset().left) / sc_w) * 100;
                $('#scrubber-progress').css('width', p+'%');
                scrubp = p;
            });
        }
    });

    $(document).on('mouseup.scrubber-track', function(e) {
        if (is_dragging_scrubber) {
            if (g_current_youtube) {
                player.currentTime = (scrubp / 100) * player.duration;
            } else {
                $('audio').get(0).currentTime = (scrubp / 100) * $('audio').get(0).duration;
            }
            $(this).off('mousemove.scrubber-track');
            is_dragging_scrubber = false;
        }
    });

    $('audio').on ('ended', function () {
        if (!g_looping)
            playNextTrack ();
    });

    $('#btn-play').click (playpause);

    $(document).keypress (function (e) {
        if (e.which == 32) {
            e.preventDefault ();
            playpause ();
        }
    });

    $('#btn-next').click (function () {
        playNextTrack ();
    });

    $('#btn-previous').click (function () {
        playPreviousTrack ();
    });

    $('#btn-loop').click (function () {
        toggleLooping ();
    });

    $('#btn-shuffle').click (function () {
        toggleShuffle ();
    });

    $('#select-playlist').on ('change', function () {
        var playlist = $('#select-playlist').val ();
        loadNewPlaylist (playlist, '');
    });

    $('#volume-slider').slider({
        orientation: "vertical",
        range: "min",
        min: 0,
        max: 100,
        value: $('audio').get (0).volume * 100,
        slide: function(event, ui) {
            //change volume here
            $('audio').get(0).volume = (ui.value / 100);
            if (ui.value > 50) {
                $('#btn-volume i').removeClass($('#btn-volume i').attr('class').split(' ')[1]).addClass('fa-volume-up');
            }
            else if (ui.value > 0) {
                $('#btn-volume i').removeClass($('#btn-volume i').attr('class').split(' ')[1]).addClass('fa-volume-down');
            }
            else {
                $('#btn-volume i').removeClass($('#btn-volume i').attr('class').split(' ')[1]).addClass('fa-volume-off');
            }

            player.volume = $('audio').get (0).volume;
            localStorage['volume'] = $('audio').get (0).volume;
        }
    });

    $('#btn-volume').on('click', function() {
        $('#volume-slider').slideToggle(200);
    });

    populatePlaylistOptions ();

    // Default playlist, random track
    var playlist = DEFAULT_PLAYLIST;
    var track = '';

    /* Load settings */
    if (localStorage.getItem ('volume') !== null) {
        $('audio').get (0).volume = localStorage.getItem('volume');
        player.volume = localStorage.getItem('volume');
    }

    if (localStorage.getItem ('playlist') !== null) {
        if (localStorage.getItem ('playlist') in PLAYLISTS)
            playlist = localStorage.getItem ('playlist');
    }

    // If hash is set, override playlist and track
    var url_track = parseTrackId (window.location.hash.substr (1));

    if (url_track !== null) {
        playlist = url_track.playlist;
        track = url_track.track;
    }

    // Load playlist and track
    loadNewPlaylist (playlist, track);
};
