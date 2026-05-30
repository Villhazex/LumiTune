use lofty::prelude::*;
use lofty::read_from_path;

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct Id3Tags {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub year: Option<i32>,
    pub genre: Option<String>,
    pub track: Option<u32>,
    pub cover_data: Option<Vec<u8>>,
    pub cover_mime: Option<String>,
}

pub fn read_id3(path: &str) -> Result<Id3Tags, String> {
    let file = read_from_path(path).map_err(|e| format!("lofty read: {}", e))?;
    let tag = file.primary_tag().or_else(|| file.first_tag());
    let tag = match tag {
        Some(t) => t,
        None => return Ok(Id3Tags::default()),
    };
    let mut r = Id3Tags {
        title: tag.title().map(|s| s.to_string()),
        artist: tag.artist().map(|s| s.to_string()),
        album: tag.album().map(|s| s.to_string()),
        year: tag.date().and_then(|d| {
            let s = d.to_string();
            if s.len() >= 4 { s[..4].parse::<i32>().ok() } else { None }
        }),
        genre: tag.genre().map(|s| s.to_string()),
        track: tag.track(),
        ..Default::default()
    };
    if let Some(pic) = tag.pictures().first() {
        r.cover_data = Some(pic.data().to_vec());
        r.cover_mime = pic.mime_type().map(|m| format!("{}", m));
    }
    Ok(r)
}

pub fn has_minimal_tags(tags: &Id3Tags) -> bool {
    tags.title.as_ref().map_or(false, |t| !t.trim().is_empty())
        && tags.artist.as_ref().map_or(false, |a| !a.trim().is_empty())
}

#[allow(dead_code)]
pub fn is_garbage_tags(tags: &Id3Tags) -> bool {
    if !has_minimal_tags(tags) {
        return true;
    }
    let garbage = ["unknown", "y2mate.com", "y2mate", "various artists"];
    let artist = tags.artist.as_deref().unwrap_or("").trim().to_lowercase();
    let title = tags.title.as_deref().unwrap_or("").trim().to_lowercase();
    garbage.contains(&artist.as_str()) || garbage.contains(&title.as_str())
}
