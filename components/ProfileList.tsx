import {
  Box,
  Button,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Radio,
  Divider,
  Typography,
} from '@mui/material';
import type { Profile } from '~/lib/types';

/**
 * Profile sidenav (T027): switch/create/clone/delete with unique auto-naming —
 * port of legacy profileService + sidenav list (src/popup.html:139-178,
 * src/scripts/main.js:206-246).
 */
export interface ProfileListProps {
  profiles: Profile[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onCreate: () => void;
  onClone: (index: number) => void;
  onDelete: (index: number) => void;
  onOpenCloudBackup: () => void;
  openLink: (url: string) => void;
}

const DONATE_URL =
  'https://www.paypal.com/cgi-bin/webscr?cmd=_donations&business=3XFKZ8PCRB8P6&currency_code=USD&amount=5&source=url';

export default function ProfileList({
  profiles,
  selectedIndex,
  onSelect,
  onCreate,
  onClone,
  onDelete,
  onOpenCloudBackup,
  openLink,
}: ProfileListProps) {
  return (
    <Box sx={{ width: 260, p: 1 }} role="presentation">
      <Typography variant="subtitle1" sx={{ px: 1, py: 0.5 }}>
        Profiles
      </Typography>
      <List dense>
        {profiles.map((profile, index) => (
          <ListItem
            key={index}
            disablePadding
            secondaryAction={
              <>
                <Button size="small" onClick={() => onClone(index)}>
                  Clone
                </Button>
                <Button size="small" onClick={() => onDelete(index)}>
                  Delete
                </Button>
              </>
            }
          >
            <ListItemButton onClick={() => onSelect(index)}>
              <Radio
                size="small"
                checked={index === selectedIndex}
                slotProps={{ input: { 'aria-label': profile.title } }}
              />
              <ListItemText primary={profile.title} />
            </ListItemButton>
          </ListItem>
        ))}
        <ListItem disablePadding>
          <ListItemButton onClick={onCreate}>
            <ListItemText primary="+ Add Profile" />
          </ListItemButton>
        </ListItem>
        <ListItem disablePadding>
          <ListItemButton onClick={onOpenCloudBackup}>
            <ListItemText primary="Cloud backup" />
          </ListItemButton>
        </ListItem>
      </List>
      <Divider />
      <List dense>
        <ListItem disablePadding>
          <ListItemButton onClick={() => openLink(DONATE_URL)}>
            <ListItemText primary="Donate" />
          </ListItemButton>
        </ListItem>
        <ListItem disablePadding>
          <ListItemButton
            onClick={() => openLink('https://github.com/hao1300/modheader')}
          >
            <ListItemText primary="Source code" />
          </ListItemButton>
        </ListItem>
        <ListItem disablePadding>
          <ListItemButton
            onClick={() => openLink('https://mod-header.appspot.com/help.html')}
          >
            <ListItemText primary="Help" />
          </ListItemButton>
        </ListItem>
      </List>
    </Box>
  );
}
