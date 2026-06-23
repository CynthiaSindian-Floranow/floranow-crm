import { AuthModal } from '@/auth/components/AuthModal';
import { AppErrorBoundary } from '@/error-handler/components/AppErrorBoundary';
import { AppFullScreenErrorFallback } from '@/error-handler/components/AppFullScreenErrorFallback';
import { AppPageErrorFallback } from '@/error-handler/components/AppPageErrorFallback';
import { FileUploadProvider } from '@/file-upload/components/FileUploadProvider';
import { InformationBannerIsImpersonating } from '@/information-banner/components/impersonate/InformationBannerIsImpersonating';
import { KeyboardShortcutMenu } from '@/keyboard-shortcut-menu/components/KeyboardShortcutMenu';
import { LayoutCustomizationBar } from '@/layout-customization/components/LayoutCustomizationBar';
import { AppNavigationDrawer } from '@/navigation/components/AppNavigationDrawer';
import { MobileNavigationBar } from '@/navigation/components/MobileNavigationBar';
import { PageDragDropProvider } from '@/navigation-menu-item/display/dnd/providers/PageDragDropProvider';
import { ModalContainerContext } from '@/ui/layout/modal/contexts/ModalContainerContext';
import { useShowFullscreen } from '@/ui/layout/fullscreen/hooks/useShowFullscreen';
import { useShowAuthModal } from '@/ui/layout/hooks/useShowAuthModal';
import { useIsMobile } from '@/ui/utilities/responsive/hooks/useIsMobile';
import { styled } from '@linaria/react';
import { AnimatePresence, LayoutGroup } from 'framer-motion';
import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { themeCssVariables } from 'twenty-ui-deprecated/theme-constants';
const StyledLayout = styled.div`
  background: ${themeCssVariables.grayScale.gray3};
  display: flex;
  flex-direction: column;
  height: 100dvh;
  position: relative;
  scrollbar-color: ${themeCssVariables.border.color.medium} transparent;
  scrollbar-width: 4px;
  width: 100%;

  *::-webkit-scrollbar-thumb {
    border-radius: ${themeCssVariables.border.radius.sm};
  }
`;

const StyledPageContainer = styled.div`
  display: flex;
  flex: 1 1 auto;
  flex-direction: row;
  min-height: 0;
  min-width: 0;
`;

const StyledNavigationDrawerWrapper = styled.div`
  flex-shrink: 0;
`;

const StyledMainContainer = styled.div`
  display: flex;
  flex: 0 1 100%;
  min-width: 0;
  overflow: hidden;
`;

// Brand-green base; the white brand panel is clipped diagonally so the green
// shows through on the right side behind the login form.
const StyledAuthSplitScreen = styled.div`
  background: #005342;
  display: flex;
  flex: 1 1 100%;
  min-width: 0;
  width: 100%;
`;

// Left: white panel with a diagonal right edge, holding the Floranow logo.
const StyledAuthBrandPanel = styled.div`
  align-items: center;
  background: #ffffff;
  clip-path: polygon(0 0, 100% 0, 82% 100%, 0 100%);
  display: flex;
  flex: 1 1 52%;
  justify-content: center;
  min-width: 0;
  padding: ${themeCssVariables.spacing[10]};
`;

const StyledAuthBrandLogo = styled.img`
  height: auto;
  max-width: 340px;
  width: 70%;
`;

// Right: green panel (transparent over the split-screen) hosting the form.
const StyledAuthLoginPanel = styled.div`
  display: flex;
  flex: 1 1 48%;
  min-width: 0;
  position: relative;

  // The auth modal portals its backdrop into this panel; clear its translucent
  // overlay so the whole green half stays a single uniform brand shade.
  [data-testid='modal-backdrop'] {
    background: transparent;
  }
`;

export const DefaultLayout = () => {
  const isMobile = useIsMobile();
  const showAuthModal = useShowAuthModal();
  const useShowFullScreen = useShowFullscreen();

  // Container the auth modal portals into so the login card stays within the
  // right half of the split-screen instead of overlaying the whole viewport.
  const [authLoginPanelElement, setAuthLoginPanelElement] =
    useState<HTMLDivElement | null>(null);

  return (
    <>
      <FileUploadProvider>
        <StyledLayout>
          <AppErrorBoundary FallbackComponent={AppFullScreenErrorFallback}>
            <InformationBannerIsImpersonating />
            <LayoutCustomizationBar />
            <StyledPageContainer>
              <PageDragDropProvider>
                {!showAuthModal && <KeyboardShortcutMenu />}
                {!showAuthModal && !useShowFullScreen && (
                  <StyledNavigationDrawerWrapper>
                    <AppNavigationDrawer />
                  </StyledNavigationDrawerWrapper>
                )}
                {showAuthModal ? (
                  <StyledMainContainer>
                    <StyledAuthSplitScreen>
                      {!isMobile && (
                        <StyledAuthBrandPanel>
                          <StyledAuthBrandLogo
                            src="/images/logo/full-logo.png"
                            alt="Floranow"
                          />
                        </StyledAuthBrandPanel>
                      )}
                      <StyledAuthLoginPanel ref={setAuthLoginPanelElement}>
                        <ModalContainerContext.Provider
                          value={{ container: authLoginPanelElement }}
                        >
                          <AnimatePresence mode="wait">
                            <LayoutGroup>
                              <AuthModal>
                                <Outlet />
                              </AuthModal>
                            </LayoutGroup>
                          </AnimatePresence>
                        </ModalContainerContext.Provider>
                      </StyledAuthLoginPanel>
                    </StyledAuthSplitScreen>
                  </StyledMainContainer>
                ) : (
                  <StyledMainContainer>
                    <AppErrorBoundary FallbackComponent={AppPageErrorFallback}>
                      <Outlet />
                    </AppErrorBoundary>
                  </StyledMainContainer>
                )}
              </PageDragDropProvider>
            </StyledPageContainer>
            {isMobile && !showAuthModal && <MobileNavigationBar />}
          </AppErrorBoundary>
        </StyledLayout>
      </FileUploadProvider>
    </>
  );
};
