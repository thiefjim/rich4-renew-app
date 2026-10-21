import UIKit
import AVFoundation
import Photos
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // The game's sound (Web Audio in the web view) plays even when the phone is on silent, like a game you
        // started on purpose; it still mixes with music from other apps. The in-game 靜音 / volume settings apply.
        Self.playSound()
        // After an interruption (a call, an alarm, another app's audio) iOS leaves our session inactive: take it back
        // as soon as the interruption ends, not only when the app becomes active again.
        NotificationCenter.default.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { note in
            guard let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
                  AVAudioSession.InterruptionType(rawValue: raw) == .ended else { return }
            Self.playSound()
        }
        return true
    }

    static func playSound() {
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [.mixWithOthers])
        try? AVAudioSession.sharedInstance().setActive(true)
    }

}

/// Xcode 27 builds must use the scene lifecycle or UIKit traps at launch. Main.storyboard (UISceneStoryboardFile in
/// Info.plist) still builds the window and GameViewController. The app has no URL schemes, so no open-URL forwarding.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func sceneDidBecomeActive(_ scene: UIScene) {
        // A call or another app may have taken the audio session; take it back when the game is in front again.
        AppDelegate.playSound()
    }
}

/// The game's web view controller (Main.storyboard): Capacitor's, with the app's own plugins registered.
class GameViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(PhotoSaverPlugin())
    }
}

/// 「儲存到相簿」 of the results screen: adds a PNG (base64 `data`) to the photo library, asking for add-only access
/// (NSPhotoLibraryAddUsageDescription). The web side is game/src/ui/share.ts.
@objc(PhotoSaverPlugin)
public class PhotoSaverPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PhotoSaverPlugin"
    public let jsName = "PhotoSaver"
    public let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "save", returnType: CAPPluginReturnPromise)]

    @objc func save(_ call: CAPPluginCall) {
        guard let b64 = call.getString("data"), let data = Data(base64Encoded: b64), UIImage(data: data) != nil else {
            call.reject("無法讀取圖片", "BAD_IMAGE")
            return
        }
        PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
            guard status == .authorized || status == .limited else {
                call.reject("沒有相簿權限", "DENIED")
                return
            }
            PHPhotoLibrary.shared().performChanges({
                PHAssetCreationRequest.forAsset().addResource(with: .photo, data: data, options: nil)
            }) { ok, error in
                if ok { call.resolve() } else { call.reject(error?.localizedDescription ?? "儲存失敗", "FAILED") }
            }
        }
    }
}
