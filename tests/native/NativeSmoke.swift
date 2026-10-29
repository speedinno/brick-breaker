import XCTest

final class NativeSmoke: XCTestCase {
    let game = XCUIApplication(bundleIdentifier: "com.speedinno.brickbreaker")
    func button(_ label: String) -> XCUIElement { game.buttons[label].firstMatch }
    func remaining() -> Int {
        let labelled = game.descendants(matching: .any).matching(NSPredicate(format: "label MATCHES %@", "^[0-9]+ bricks remaining$")).firstMatch
        if labelled.exists { return Int(labelled.label.split(separator: " ").first ?? "") ?? -1 }
        // iOS WebKit exposes the visible bold counter as a static text instead of
        // forwarding its aria-label. Stage 1 has four digits throughout this check.
        let visible = game.staticTexts.matching(NSPredicate(format: "label MATCHES %@", "^[0-9]{4}$")).firstMatch
        return visible.exists ? Int(visible.label) ?? -1 : -1
    }
    func waitForField() {
        let expectation = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in self.remaining() > 0 }, object: nil)
        XCTAssertEqual(XCTWaiter.wait(for: [expectation], timeout: 60), .completed, "Bundled field must finish loading")
    }
    func shot(_ name: String) {
        let attachment = XCTAttachment(screenshot: game.screenshot())
        attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
    }
    func enterFromHome() {
        let play = button("Play or continue stage")
        XCTAssertTrue(play.waitForExistence(timeout: 30), "Cold launch must show the home menu")
        let ready = XCTNSPredicateExpectation(predicate: NSPredicate(format: "enabled == true"), object: play)
        XCTAssertEqual(XCTWaiter.wait(for: [ready], timeout: 60), .completed)
        shot("iPhone-home"); play.tap()
        if button("Close help").waitForExistence(timeout: 2) { shot("iPhone-how-to-play"); button("Close help").tap() }
    }
    func testPackagedGamePlayAndColdResume() {
        continueAfterFailure = false
        game.launch(); enterFromHome(); waitForField(); shot("iPhone-ready")
        for label in ["Home", "How to play", "Pause", "Open stage journey", "Account and cloud saves"] {
            let control = button(label)
            XCTAssertTrue(control.isHittable, "\(label) must be reachable within the safe area")
            XCTAssertGreaterThanOrEqual(control.frame.width, 43.5)
            XCTAssertGreaterThanOrEqual(control.frame.height, 43.5)
            XCTAssertTrue(game.frame.contains(control.frame), "\(label) must stay inside the phone display")
        }
        let initial = remaining(); XCTAssertGreaterThan(initial, 1000)
        button("Account and cloud saves").tap()
        let email = game.textFields["you@example.com"].firstMatch
        XCTAssertTrue(email.waitForExistence(timeout: 5), "Configured account sign-in must be available")
        email.tap()
        XCTAssertTrue(game.keyboards.firstMatch.waitForExistence(timeout: 10), "Email field must open the software keyboard")
        shot("iPhone-account-keyboard")
        let closeAccount = button("Close account")
        let reachable = XCTNSPredicateExpectation(predicate: NSPredicate(format: "hittable == true"), object: closeAccount)
        XCTAssertEqual(XCTWaiter.wait(for: [reachable], timeout: 5), .completed, "Account close must remain accessible above the keyboard")
        XCTAssertTrue(game.frame.contains(closeAccount.frame))
        button("Close account").tap()
        let accountClosed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: closeAccount)
        XCTAssertEqual(XCTWaiter.wait(for: [accountClosed], timeout: 5), .completed, "One tap must close the account panel while the keyboard is open")
        button("Open stage journey").tap()
        let locked = game.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Stage 13, Locked")).firstMatch
        XCTAssertTrue(locked.waitForExistence(timeout: 10)); locked.tap()
        XCTAssertTrue(button("Close unlock requirement").waitForExistence(timeout: 10))
        button("Close unlock requirement").tap()
        let closeStages = button("Close stages")
        XCTAssertTrue(closeStages.isHittable, "Scrolled stage-picker close control must remain tappable")
        closeStages.tap()
        let closed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: closeStages)
        XCTAssertEqual(XCTWaiter.wait(for: [closed], timeout: 5), .completed, "One tap must close the scrolled stage picker")
        let launch = button("Launch")
        XCTAssertTrue(launch.waitForExistence(timeout: 10), "A first-time player must see the ready guidance before manual play")
        XCTAssertTrue(game.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] %@", "Tap to place")).firstMatch.exists)
        let aim = game.sliders["Launch angle, left to right"].firstMatch
        XCTAssertTrue(aim.isHittable, "Manual launch angle must be adjustable on the phone")
        // WKWebView's range has no native XCTest scrubber coordinates and a
        // track tap leaves the thumb centered. Drag the visible thumb to +5°.
        aim.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
            .press(forDuration: 0.1, thenDragTo: aim.coordinate(withNormalizedOffset: CGVector(dx: 0.545, dy: 0.5)))
        shot("iPhone-manual-aim")
        launch.tap()
        let speed = button("Playback speed")
        let speedReady = XCTNSPredicateExpectation(predicate: NSPredicate(format: "hittable == true"), object: speed)
        XCTAssertEqual(XCTWaiter.wait(for: [speedReady], timeout: 5), .completed, "Playback speed must be reachable after Launch hides the ready panel")
        XCTAssertGreaterThanOrEqual(speed.frame.width, 43.5)
        XCTAssertGreaterThanOrEqual(speed.frame.height, 43.5)
        XCTAssertTrue(game.frame.contains(speed.frame), "Playback speed must stay inside the phone display")
        let destroyed = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in self.remaining() > 0 && self.remaining() < initial }, object: nil)
        XCTAssertEqual(XCTWaiter.wait(for: [destroyed], timeout: 30), .completed, "The aimed opening shot must break a real brick")
        let left = game.coordinate(withNormalizedOffset: CGVector(dx: 0.35, dy: 0.61))
        let right = game.coordinate(withNormalizedOffset: CGVector(dx: 0.65, dy: 0.61))
        left.press(forDuration: 0.1, thenDragTo: right)
        right.press(forDuration: 0.1, thenDragTo: left)
        button("Pause").tap(); let saved = remaining(); XCTAssertGreaterThan(saved, 0); XCTAssertLessThan(saved, initial)
        shot("iPhone-paused-gameplay")
        game.terminate(); game.launch(); enterFromHome(); waitForField()
        XCTAssertEqual(remaining(), saved, "Cold restart must restore the damaged field")
        let resume = game.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Continue")).firstMatch
        XCTAssertTrue(resume.waitForExistence(timeout: 15)); shot("iPhone-restored-field"); resume.tap()
        XCTAssertTrue(button("Pause").waitForExistence(timeout: 10)); shot("iPhone-resumed")
    }
}
