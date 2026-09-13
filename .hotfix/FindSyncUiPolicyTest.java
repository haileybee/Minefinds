package com.hailey.minefinds;

public final class FindSyncUiPolicyTest {
    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }

    public static void main(String[] args) {
        check(!FindSyncUiPolicy.shouldRefreshAfterSync(false),
                "Silent/background sync must never navigate away from the current screen");
        check(FindSyncUiPolicy.shouldRefreshAfterSync(true),
                "Explicit manual sync may refresh the visible Nearby screen");
        System.out.println("FindSyncUiPolicyTest passed");
    }
}
