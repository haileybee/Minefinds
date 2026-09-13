package com.hailey.minefinds;

public final class FindSyncUiPolicy {
    private FindSyncUiPolicy() {}

    public static boolean shouldRefreshAfterSync(boolean userRequestedSync) {
        return userRequestedSync;
    }
}
