use std::path::Path;

fn normalize_title(s: &str) -> String {
    let mut s = s.trim().to_lowercase();

    let suffixes = [
        "(official video)", "(official lyric video)", "(official music video)",
        "[official video]", "[official lyric video]", "[official music video]",
        "(official audio)", "[official audio]", "(lyrics)", "[lyrics]",
        "(lyric video)", "(audio)", "(official)", "(hd)",
        "[hd]", "(music video)", "[music video]",
    ];
    loop {
        let mut changed = false;
        for suf in &suffixes {
            if s.ends_with(suf) {
                s = s[..s.len() - suf.len()].trim().to_string();
                changed = true;
                break;
            }
        }
        if !changed {
            break;
        }
    }

    if let Some(idx) = s.rfind(" - ") {
        let after = s[idx + 3..].trim().to_string();
        let tags = ["feat", "feat.", "ft", "ft.", "featuring", "with"];
        if tags.iter().any(|t| after.starts_with(t)) {
            s = s[..idx].trim().to_string();
        }
    }

    for suf in &["(remastered)", "(remaster)", "remastered", "remaster"] {
        if s.ends_with(suf) {
            s = s[..s.len() - suf.len()].trim().to_string();
            break;
        }
    }

    let mut prev = ' ';
    s = s.chars()
        .filter(|c| {
            let b = *c != ' ' || prev != ' ';
            prev = *c;
            b
        })
        .collect::<String>()
        .trim()
        .to_string();

    s
}

fn levenshtein(a: &str, b: &str) -> usize {
    let a_chars: Vec<char> = a.chars().collect();
    let b_chars: Vec<char> = b.chars().collect();
    let a_len = a_chars.len();
    let b_len = b_chars.len();
    if a_len == 0 { return b_len; }
    if b_len == 0 { return a_len; }

    let mut prev: Vec<usize> = (0..=b_len).collect();
    let mut curr: Vec<usize> = vec![0; b_len + 1];

    for (i, ca) in a_chars.iter().enumerate() {
        curr[0] = i + 1;
        for (j, cb) in b_chars.iter().enumerate() {
            let cost = if ca == cb { 0 } else { 1 };
            curr[j + 1] = std::cmp::min(
                std::cmp::min(curr[j] + 1, prev[j + 1] + 1),
                prev[j] + cost,
            );
        }
        std::mem::swap(&mut prev, &mut curr);
    }
    prev[b_len]
}

pub fn similarity(a: &str, b: &str) -> f64 {
    if a.is_empty() && b.is_empty() { return 1.0; }
    if a.is_empty() || b.is_empty() { return 0.0; }
    let a = normalize_title(a);
    let b = normalize_title(b);
    if a == b { return 1.0; }
    let max_len = a.len().max(b.len()) as f64;
    if max_len == 0.0 { return 1.0; }
    1.0 - (levenshtein(&a, &b) as f64 / max_len)
}

pub fn titles_match(a: &str, b: &str) -> bool {
    similarity(a, b) >= 0.8
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct FilenameParseResult {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub track_number: Option<i32>,
    pub confidence: f64,
    pub suspected_swapped: bool,
    pub parse_strategy: String,
}

fn strip_suffixes(s: &str) -> String {
    let mut s = s.trim().to_string();
    let suffixes = [
        " (Official HD Video)", " (Official Lyric Video)", " (Official Music Video)",
        " [Official HD Video]", " [Official Lyric Video]", " [Official Music Video]",
        " Official HD Video", " Official Lyric Video", " Official Music Video",
        " (Official Video)", " [Official Video]", " (Official Audio)",
        " [Official Audio]", " (Lyrics)", " [Lyrics]", " (Lyric Video)",
        " (Audio)", " (Official)", " Official Video", " Official Audio",
        " (Lyric)", " [Lyric]", " - Lyric", " - Lyrics", " Lyric", " Lyrics",
        " (Terjemahan)", " [Terjemahan]", " - Terjemahan", " Terjemahan",
        " - Copy", " (Copy)", " [Copy]",
        " Official Lyric Video", " Official Music Video",
        " (Visualizer)", " [Visualizer]", " - Visualizer", " Visualizer",
        " (Audio Only)", " [Audio Only]",
        "(Official HD Video)", "(Official Lyric Video)", "(Official Music Video)",
        "[Official HD Video]", "[Official Lyric Video]", "[Official Music Video]",
        "(Official Video)", "[Official Video]", "(Official Audio)", "[Official Audio]",
        "(Lyrics)", "[Lyrics]", "(Lyric Video)", "(Audio)", "(Official)",
        "(Lyric)", "[Lyric]", "(Terjemahan)", "[Terjemahan]",
        "(Visualizer)", "[Visualizer]", "(Audio Only)", "[Audio Only]",
        "(Cover)", "[Cover]", " - Cover", " Cover",
    ];
    loop {
        let lower = s.to_lowercase();
        let mut changed = false;
        for suffix in &suffixes {
            if lower.ends_with(&suffix.to_lowercase()) {
                s = s[..s.len() - suffix.len()].trim().to_string();
                changed = true;
                break;
            }
        }
        if !changed { break; }
    }
    s
}

fn strip_prefixes(s: &str) -> String {
    let mut s = s.to_string();
    let prefixes = ["y2mate.com", "youtube.com", "youtu.be"];
    for p in &prefixes {
        let prefix = format!("{} - ", p);
        if s.to_lowercase().starts_with(&prefix.to_lowercase()) {
            s = s[p.len() + 3..].trim().to_string();
            break;
        }
    }
    s
}

// Keywords that strongly suggest a segment is a TITLE (not an artist)
const TITLE_KEYWORDS: &[&str] = &[
    "feat", "featuring", "ft.", "official", "lyrics", "lyric", "remix",
    "live", "opening", "ending", "theme", "amv", "mv", "video", "audio",
    "instrumental", "acoustic", "cover", "version", "mix", "edit", "demo",
];

fn is_title_keyword(text: &str) -> bool {
    let lower = text.to_lowercase();
    TITLE_KEYWORDS.iter().any(|kw| lower.contains(kw))
}

fn score_as_artist(text: &str) -> f64 {
    let lower = text.to_lowercase();
    // If contains title keywords → definitely not artist
    if is_title_keyword(text) {
        return 0.0;
    }
    // Garbage → low
    let garbage = ["y2mate.com", "youtube.com", "youtu.be", "unknown", "various artists", "topic"];
    if garbage.iter().any(|g| lower.contains(g)) {
        return 0.1;
    }
    let mut score: f64 = 0.5;
    // Shorter = more likely artist
    let len = text.len();
    if len > 40 {
        score -= 0.3;
    } else if len > 25 {
        score -= 0.1;
    } else if len <= 10 {
        score += 0.15;
    }
    // Fewer words = more likely artist
    let words = text.split_whitespace().count();
    if words <= 2 {
        score += 0.15;
    } else if words >= 5 {
        score -= 0.15;
    }
    // No special chars → more likely artist
    if text.contains('(') || text.contains('[') || text.contains('{') {
        score -= 0.1;
    }
    // No "the" prefix for single word — common artist pattern
    if words == 1 && !lower.starts_with("the") {
        score += 0.1;
    }
    score.max(0.0).min(1.0)
}

fn score_as_title(text: &str) -> f64 {
    let mut score: f64 = 0.3;
    // Title keywords → strong signal
    if is_title_keyword(text) {
        score += 0.35;
    }
    // Parentheses/brackets → common in titles
    if text.contains('(') || text.contains('[') || text.contains('{') {
        score += 0.15;
    }
    // Longer = more likely title
    let len = text.len();
    if len > 50 {
        score += 0.15;
    } else if len > 25 {
        score += 0.05;
    }
    // Highly multi-word → more likely title
    let words = text.split_whitespace().count();
    if words >= 5 {
        score += 0.1;
    }
    score.max(0.0).min(1.0)
}

pub fn parse_filename(path: &str) -> FilenameParseResult {
    let name = Path::new(path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_string();
    if name.is_empty() {
        return FilenameParseResult {
            title: None, artist: None, album: None,
            track_number: None, confidence: 0.0,
            suspected_swapped: false, parse_strategy: "empty".into(),
        };
    }

    // Album hint from parent directory
    let album = Path::new(path)
        .parent()
        .and_then(|p| p.file_name())
        .and_then(|s| s.to_str())
        .map(|s| {
            let s = s.replace(|c: char| c == '_' || c == '.', " ");
            s.trim().to_string()
        })
        .filter(|s| !s.is_empty() && !s.eq_ignore_ascii_case("music") && !s.eq_ignore_ascii_case("downloads"));

    let mut s = strip_prefixes(&name);
    s = strip_suffixes(&s);

    let garbage_artists = ["y2mate.com", "youtube.com", "youtu.be", "unknown", "various artists"];

    // Track number prefix: "01 - Artist - Title" or "01 Title"
    let track_prefix = {
        let s_bytes = s.as_bytes();
        let mut i = 0;
        while i < s_bytes.len() && s_bytes[i].is_ascii_digit() {
            i += 1;
        }
        if i >= 2 && i <= 3 {
            let rest = s[i..].trim_start_matches(|c: char| c == ' ' || c == '-' || c == '.' || c == '_');
            Some((s[..i].parse::<i32>().unwrap_or(0), rest.to_string()))
        } else {
            None
        }
    };
    if let Some((track, rest)) = track_prefix {
        if let Some(idx) = rest.find(" - ") {
            let left = rest[..idx].trim().to_string();
            let right = rest[idx + 3..].trim().to_string();
            let left_lower = left.to_lowercase();
            if !left.is_empty() && !right.is_empty() && !garbage_artists.contains(&left_lower.as_str()) {
                // Heuristic scoring for track-numbered files
                let art_a = score_as_artist(&left);
                let art_b = score_as_artist(&right);
                let title_a = score_as_title(&left);
                let title_b = score_as_title(&right);
                let score_normal = art_a + title_b;  // Artist - Title
                let score_swapped = title_a + art_b; // Title - Artist
                if score_swapped > score_normal {
                    return FilenameParseResult {
                        title: Some(left),
                        artist: Some(right),
                        album,
                        track_number: Some(track),
                        confidence: 0.7,
                        suspected_swapped: false,
                        parse_strategy: "track_title_artist".into(),
                    };
                }
                return FilenameParseResult {
                    title: Some(right),
                    artist: Some(left),
                    album,
                    track_number: Some(track),
                    confidence: 0.85,
                    suspected_swapped: false,
                    parse_strategy: "track_artist_title".into(),
                };
            }
        }
        if track > 0 && !rest.is_empty() {
            return FilenameParseResult {
                title: Some(rest),
                artist: None, album,
                track_number: Some(track),
                confidence: 0.55,
                suspected_swapped: false,
                parse_strategy: "track_title".into(),
            };
        }
    }

    // ---- Multiple parse strategies for " - " separator ----
    if let Some(idx) = s.find(" - ") {
        let left = s[..idx].trim().to_string();
        let right = s[idx + 3..].trim().to_string();
        let left_lower = left.to_lowercase();

        if !left.is_empty() && !right.is_empty() && !garbage_artists.contains(&left_lower.as_str()) {
            // Heuristic scoring for both strategies
            let art_left = score_as_artist(&left);
            let title_left = score_as_title(&left);
            let art_right = score_as_artist(&right);
            let title_right = score_as_title(&right);

            // Strategy A: left=Artist, right=Title
            let score_a = art_left + title_right;
            // Strategy B: left=Title, right=Artist
            let score_b = title_left + art_right;

            // Weight toward "Artist - Title" as default (70/30)
            let score_a_weighted = score_a + 0.15;
            let score_b_weighted = score_b;

            let diff = (score_a_weighted - score_b_weighted).abs();

            if score_a_weighted >= score_b_weighted {
                let mut confidence = 0.5 + score_a_weighted * 0.25;
                let suspected_swapped = diff < 0.25; // close scores → unsure
                if suspected_swapped {
                    confidence *= 0.8; // penalize ambiguous
                }
                return FilenameParseResult {
                    title: Some(right),
                    artist: Some(left),
                    album,
                    track_number: None,
                    confidence: confidence.min(0.85),
                    suspected_swapped,
                    parse_strategy: if suspected_swapped { "artist_title_ambiguous".into() } else { "artist_title".into() },
                };
            } else {
                let mut confidence = 0.4 + score_b_weighted * 0.2;
                let suspected_swapped = diff < 0.25;
                if suspected_swapped {
                    confidence *= 0.8;
                }
                return FilenameParseResult {
                    title: Some(left),
                    artist: Some(right),
                    album,
                    track_number: None,
                    confidence: confidence.min(0.75),
                    suspected_swapped: true, // always flag as swapped when we choose Title - Artist
                    parse_strategy: if suspected_swapped { "title_artist_ambiguous".into() } else { "title_artist".into() },
                };
            }
        }
    }

    // "Artist  Title" or "Title  Artist" double space — with heuristic scoring
    if let Some(idx) = s.find("  ") {
        let left = s[..idx].trim().to_string();
        let right = s[idx + 2..].trim().to_string();
        let left_lower = left.to_lowercase();
        if !left.is_empty() && !right.is_empty() && !garbage_artists.contains(&left_lower.as_str()) {
            let art_left = score_as_artist(&left);
            let title_left = score_as_title(&left);
            let second_space = right.find("  ");
            // Multi-segment: right side has more segments — check if first segment is an artist
            let (right_first, right_extra) = if let Some(sp) = second_space {
                (right[..sp].trim().to_string(), Some(right[sp + 2..].trim().to_string()))
            } else { (right.clone(), None) };
            let art_right_first = if second_space.is_some() { score_as_artist(&right_first) } else { score_as_artist(&right) };
            let art_right = art_right_first;
            let title_right = score_as_title(&right);
            // If right side is multi-segment and its first segment looks like an artist
            // while left looks like a title → override to Title-Artist
            let multi_swap = right_extra.as_ref().and_then(|_| {
                if art_right_first > title_left && title_left > art_left { Some(()) } else { None }
            });
            let score_a = art_left + title_right;
            let score_b = title_left + art_right;
            let score_a_weighted = if multi_swap.is_some() { 0.0 } else { score_a + 0.15 };
            let score_b_weighted = if multi_swap.is_some() { 999.0 } else { score_b };
            if score_a_weighted >= score_b_weighted {
                let mut confidence = 0.5 + score_a_weighted * 0.25;
                let diff = (score_a_weighted - score_b_weighted).abs();
                let suspected = diff < 0.25;
                if suspected { confidence *= 0.8; }
                return FilenameParseResult {
                    title: Some(right), artist: Some(left), album,
                    track_number: None, confidence: confidence.min(0.85),
                    suspected_swapped: suspected,
                    parse_strategy: if suspected { "dblspace_artist_title_ambiguous".into() } else { "dblspace_artist_title".into() },
                };
            } else {
                let mut confidence = 0.4 + score_b_weighted * 0.2;
                // Use first segment as artist when multi-segment; discard extra garbage
                let artist_name = if let Some(extra) = right_extra {
                    let more = if extra.len() < 60 { format!(" {}", extra) } else { String::new() };
                    if more.len() + right_first.len() > 80 {
                        right_first.clone()
                    } else {
                        format!("{}{}", right_first, more)
                    }
                } else { right.clone() };
                if second_space.is_some() { confidence = (confidence + 0.05).min(0.85); }
                let diff = (score_a_weighted - score_b_weighted).abs();
                let suspected = diff < 0.25;
                if suspected { confidence *= 0.8; }
                return FilenameParseResult {
                    title: Some(left), artist: Some(artist_name), album,
                    track_number: None, confidence: confidence.min(0.75),
                    suspected_swapped: true,
                    parse_strategy: if suspected { "dblspace_title_artist_ambiguous".into() } else { "dblspace_title_artist".into() },
                };
            }
        }
    }

    // No separator found — use whole filename as title
    let mut prev = ' ';
    s = s.chars().filter(|c| { let b = *c != ' ' || prev != ' '; prev = *c; b }).collect::<String>().trim().to_string();

    FilenameParseResult {
        title: Some(s), artist: None, album,
        track_number: None, confidence: 0.25,
        suspected_swapped: false,
        parse_strategy: "whole_filename".into(),
    }
}
