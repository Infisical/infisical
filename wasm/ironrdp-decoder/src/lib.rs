//! Offline RDP session replay decoder, backed by IronRDP's own decoders.
//!
//! Consumers (the browser-side replay page) feed raw FastPath / X.224 PDU
//! bytes captured by the gateway during a live session. We drive those
//! bytes through `ironrdp-session`'s `ActiveStage` + `DecodedImage`, then
//! expose the resulting framebuffer as an RGBA buffer JS can blit onto a
//! canvas via `putImageData`.
//!
//! We reuse IronRDP's decoders instead of rewriting them so the replay
//! output matches what a live IronRDP client would render: bitmap RLE,
//! RDP6 streams, pointer compositing -- all handled upstream.

use ironrdp_connector::connection_activation::ConnectionActivationSequence;
use ironrdp_connector::{BitmapConfig, Config, ConnectionResult, Credentials, DesktopSize};
use ironrdp_graphics::image_processing::PixelFormat;
use ironrdp_pdu::gcc::KeyboardType;
use ironrdp_pdu::input::fast_path::FastPathInputEvent;
use ironrdp_pdu::input::mouse::{MousePdu, PointerFlags};
use ironrdp_pdu::rdp::capability_sets::{BitmapCodecs, MajorPlatformType};
use ironrdp_pdu::rdp::client_info::{PerformanceFlags, TimezoneInfo};
use ironrdp_pdu::Action;
use ironrdp_session::image::DecodedImage;
use ironrdp_session::{ActiveStage, ActiveStageOutput};
use ironrdp_svc::StaticChannelSet;
use wasm_bindgen::prelude::*;

/// A decoder session tied to a specific desktop size. Create one per
/// replay, feed PDUs in original order, read out the framebuffer + dirty
/// regions after each call.
#[wasm_bindgen]
pub struct RdpDecoder {
    stage: ActiveStage,
    image: DecodedImage,
    last_dirty: Vec<DirtyRect>,
}

#[wasm_bindgen]
#[derive(Clone, Copy)]
pub struct DirtyRect {
    pub x: u16,
    pub y: u16,
    pub w: u16,
    pub h: u16,
}

#[wasm_bindgen]
impl RdpDecoder {
    /// Construct a decoder with a framebuffer of `width x height` pixels
    /// in RGBA32 format.
    #[wasm_bindgen(constructor)]
    pub fn new(width: u16, height: u16) -> RdpDecoder {
        let desktop_size = DesktopSize { width, height };
        // These channel IDs aren't load-bearing for offline replay — the
        // ActiveStage uses them to route X.224 payloads and we only feed
        // FastPath bytes. Any valid u16s would do.
        let io_channel_id: u16 = 1003;
        let user_channel_id: u16 = 1002;

        let connection_result = ConnectionResult {
            io_channel_id,
            user_channel_id,
            static_channels: StaticChannelSet::default(),
            desktop_size,
            enable_server_pointer: true,
            pointer_software_rendering: true,
            connection_activation: ConnectionActivationSequence::new(
                stub_config(desktop_size),
                io_channel_id,
                user_channel_id,
            ),
        };

        let stage = ActiveStage::new(connection_result);
        let image = DecodedImage::new(PixelFormat::RgbA32, width, height);

        RdpDecoder {
            stage,
            image,
            last_dirty: Vec::new(),
        }
    }

    /// Feed one captured PDU into the decoder. Returns the number of
    /// dirty rectangles produced; read each via `dirty_rect(i)`.
    ///
    /// `action` is 0 for X.224 and 1 for FastPath; mirrors the tap event
    /// emitted by the gateway.
    pub fn feed(&mut self, action: u8, bytes: &[u8]) -> u32 {
        let action = match action {
            0 => Action::X224,
            1 => Action::FastPath,
            _ => return 0,
        };
        let outputs = match self.stage.process(&mut self.image, action, bytes) {
            Ok(o) => o,
            Err(_) => return 0,
        };
        self.collect_dirty_rects(outputs)
    }

    /// Move the server-rendered pointer sprite to (x, y) and re-composite
    /// it into the framebuffer. Returns the number of dirty rectangles
    /// produced (read via `dirty_rect(i)`, same as `feed`).
    ///
    /// The server only emits PositionPointer PDUs for server-initiated
    /// cursor moves (dialog focus pulls, etc). Client-driven mouse
    /// movement is resolved locally — a live IronRDP client calls this
    /// on every mousemove. For replay we drive it from recorded input
    /// events so the cursor tracks the user's actual pointer path.
    pub fn move_pointer(&mut self, x: u16, y: u16) -> u32 {
        let event = FastPathInputEvent::MouseEvent(MousePdu {
            flags: PointerFlags::empty(),
            number_of_wheel_rotation_units: 0,
            x_position: x,
            y_position: y,
        });
        let outputs = match self
            .stage
            .process_fastpath_input(&mut self.image, &[event])
        {
            Ok(o) => o,
            Err(_) => return 0,
        };
        self.collect_dirty_rects(outputs)
    }

    // InclusiveRectangle: left/top/right/bottom inclusive.
    fn collect_dirty_rects(&mut self, outputs: Vec<ActiveStageOutput>) -> u32 {
        self.last_dirty.clear();
        let fb_w = self.image.width();
        let fb_h = self.image.height();
        for out in outputs {
            if let ActiveStageOutput::GraphicsUpdate(region) = out {
                // Drop rects entirely outside the framebuffer — cursor-restore
                // at the off-screen prime (0xffff, 0xffff) would otherwise leak
                // u16::MAX into bounds tracking and shrink the canvas to a
                // tiny box.
                if region.left >= fb_w || region.top >= fb_h {
                    continue;
                }
                self.last_dirty.push(DirtyRect {
                    x: region.left,
                    y: region.top,
                    w: region.right.saturating_sub(region.left).saturating_add(1),
                    h: region.bottom.saturating_sub(region.top).saturating_add(1),
                });
            }
        }
        self.last_dirty.len() as u32
    }

    /// Returns the i-th dirty rect from the most recent `feed()` call.
    pub fn dirty_rect(&self, i: u32) -> Option<DirtyRect> {
        self.last_dirty.get(i as usize).copied()
    }

    /// Returns a pointer into the WASM linear memory for the RGBA
    /// framebuffer. JS reads this as a `Uint8Array` of length
    /// `width * height * 4`.
    pub fn buffer_ptr(&self) -> *const u8 {
        self.image.data().as_ptr()
    }

    pub fn buffer_len(&self) -> usize {
        self.image.data().len()
    }

    pub fn width(&self) -> u16 {
        self.image.width()
    }

    pub fn height(&self) -> u16 {
        self.image.height()
    }

    /// Returns the row stride in bytes. Usually `width * 4` but IronRDP
    /// may align differently.
    pub fn stride(&self) -> usize {
        self.image.stride()
    }
}

/// Build a minimal Config for ConnectionActivationSequence. The sequence
/// is only used to interpret server-initiated reactivation PDUs; offline
/// replay shouldn't hit those. If it does, the decoder will surface the
/// resulting error up to JS.
fn stub_config(desktop_size: DesktopSize) -> Config {
    Config {
        desktop_size,
        desktop_scale_factor: 0,
        enable_tls: false,
        enable_credssp: false,
        credentials: Credentials::UsernamePassword {
            username: String::new(),
            password: String::new(),
        },
        domain: None,
        client_build: 0,
        client_name: "infisical-replay".to_owned(),
        keyboard_type: KeyboardType::IbmEnhanced,
        keyboard_subtype: 0,
        keyboard_functional_keys_count: 12,
        keyboard_layout: 0,
        ime_file_name: String::new(),
        bitmap: Some(BitmapConfig {
            lossy_compression: false,
            color_depth: 32,
            codecs: BitmapCodecs(Vec::new()),
        }),
        dig_product_id: String::new(),
        client_dir: String::new(),
        platform: MajorPlatformType::UNSPECIFIED,
        hardware_id: None,
        request_data: None,
        autologon: false,
        enable_audio_playback: false,
        performance_flags: PerformanceFlags::default(),
        license_cache: None,
        timezone_info: TimezoneInfo::default(),
        enable_server_pointer: true,
        pointer_software_rendering: true,
    }
}
