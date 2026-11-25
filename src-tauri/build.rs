use std::{env, fs, path::PathBuf};

fn push_u16(out: &mut Vec<u8>, value: u16) {
    out.extend_from_slice(&value.to_le_bytes());
}

fn push_u32(out: &mut Vec<u8>, value: u32) {
    out.extend_from_slice(&value.to_le_bytes());
}

fn generate_fallback_icon() -> Vec<u8> {
    const SIZE: usize = 32;
    let mut dib = Vec::with_capacity(40 + SIZE * SIZE * 4 + SIZE * 4);

    // BITMAPINFOHEADER. ICO DIB height includes the XOR and AND masks.
    push_u32(&mut dib, 40);
    push_u32(&mut dib, SIZE as u32);
    push_u32(&mut dib, (SIZE * 2) as u32);
    push_u16(&mut dib, 1);
    push_u16(&mut dib, 32);
    push_u32(&mut dib, 0);
    push_u32(&mut dib, (SIZE * SIZE * 4) as u32);
    push_u32(&mut dib, 2835);
    push_u32(&mut dib, 2835);
    push_u32(&mut dib, 0);
    push_u32(&mut dib, 0);

    // Bottom-up BGRA pixels: navy tile with a simple white M glyph.
    for y in (0..SIZE).rev() {
        for x in 0..SIZE {
            let border = x < 2 || x >= SIZE - 2 || y < 2 || y >= SIZE - 2;
            let left_stem = (5..=8).contains(&x) && (7..=25).contains(&y);
            let right_stem = (23..=26).contains(&x) && (7..=25).contains(&y);
            let left_diag = (9..=15).contains(&x) && y >= 7 + (x - 9) && y <= 14 + (x - 9);
            let right_diag = (16..=22).contains(&x) && y >= 14 + (22 - x) && y <= 21 + (22 - x);
            let white = !border && (left_stem || right_stem || left_diag || right_diag);
            let (b, g, r) = if white { (245u8, 248u8, 255u8) } else { (112u8, 48u8, 18u8) };
            dib.extend_from_slice(&[b, g, r, 255]);
        }
    }

    // 1-bit AND mask; zero means every pixel is opaque.
    dib.extend(std::iter::repeat(0u8).take(SIZE * 4));

    let mut ico = Vec::with_capacity(22 + dib.len());
    push_u16(&mut ico, 0);
    push_u16(&mut ico, 1);
    push_u16(&mut ico, 1);
    ico.push(SIZE as u8);
    ico.push(SIZE as u8);
    ico.push(0);
    ico.push(0);
    push_u16(&mut ico, 1);
    push_u16(&mut ico, 32);
    push_u32(&mut ico, dib.len() as u32);
    push_u32(&mut ico, 22);
    ico.extend_from_slice(&dib);
    ico
}

fn main() {
    let manifest_dir = PathBuf::from(env::var_os("CARGO_MANIFEST_DIR").expect("manifest directory"));
    let icon_dir = manifest_dir.join("icons");
    let icon_path = icon_dir.join("icon.ico");

    if !icon_path.exists() {
        fs::create_dir_all(&icon_dir).expect("create Tauri icons directory");
        fs::write(&icon_path, generate_fallback_icon()).expect("write fallback Windows icon");
    }

    println!("cargo:rerun-if-changed=tauri.conf.json");
    println!("cargo:rerun-if-changed=icons/icon.ico");
    tauri_build::build();
}
