package com.hailey.minefinds;

public class ShareCodePresentationTest {
    public static void main(String[] args) {
        require(ShareCodePresentation.shouldShowSavedCode(true, "ABCD2345"), "shared world with valid code should show code");
        require(!ShareCodePresentation.shouldShowSavedCode(false, "ABCD2345"), "unshared world should not show code");
        require(!ShareCodePresentation.shouldShowSavedCode(true, ""), "blank code should regenerate");
        require("ABCD2345".equals(ShareCodePresentation.normalizedForDisplay("ab-cd 2345")), "display code normalized");
        System.out.println("ShareCodePresentationTest: PASS");
    }

    private static void require(boolean ok, String label) {
        if (!ok) throw new AssertionError(label);
    }
}
