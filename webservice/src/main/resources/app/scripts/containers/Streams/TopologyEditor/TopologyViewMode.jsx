/**
  * Copyright 2017 Hortonworks.
  *
  * Licensed under the Apache License, Version 2.0 (the "License");
  * you may not use this file except in compliance with the License.
  * You may obtain a copy of the License at
  *   http://www.apache.org/licenses/LICENSE-2.0
  * Unless required by applicable law or agreed to in writing, software
  * distributed under the License is distributed on an "AS IS" BASIS,
  * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  * See the License for the specific language governing permissions and
  * limitations under the License.
**/

import React, {Component} from 'react';
import ReactDOM from 'react-dom';
import _ from 'lodash';
import {Link} from 'react-router';
import moment from 'moment';
import DateTimePickerDropdown from '../../../components/DateTimePickerDropdown';
import {DropdownButton, MenuItem, InputGroup, OverlayTrigger, Tooltip, Button, ButtonGroup, ToggleButtonGroup,
  ToggleButton, Panel} from 'react-bootstrap';
import Utils from '../../../utils/Utils';
import ViewModeREST from '../../../rest/ViewModeREST';
import EnvironmentREST from '../../../rest/EnvironmentREST';
import ClusterREST from '../../../rest/ClusterREST';
import TopologyUtils from '../../../utils/TopologyUtils';
import app_state from '../../../app_state';
import {hasEditCapability, hasViewCapability,findSingleAclObj,handleSecurePermission} from '../../../utils/ACLUtils';
import {observer} from 'mobx-react';

@observer
class TopologyViewMode extends Component {
  constructor(props) {
    super(props);
    this.state = {
      stormViewUrl: '',
      logLevel: 'None',
      durationSecs: 0,
      displayTime: '0:0',
      sampling: 0,
      selectedMode: props.viewModeData.selectedMode,
      startDate: props.startDate,
      endDate: props.endDate,
      showLogSearchBtn: props.showLogSearchBtn
    };
    this.stormClusterChkID(props.stormClusterId);
  }
  stormClusterChkID = (id) => {
    if (id) {
      this.fetchData(id);
    }
  }
  componentDidMount() {
    const container = document.querySelector('.content-wrapper');
    container.setAttribute("class", "content-wrapper view-mode-wrapper");
    this.getLogLevel();
  }
  componentWillUnmount() {
    const container = document.querySelector('.content-wrapper');
    container.setAttribute("class", "content-wrapper");
  }
  componentWillReceiveProps(props) {
    if (props.stormClusterId) {
      this.fetchData(props.stormClusterId);
    }
    this.setState({startDate: props.startDate, endDate: props.endDate, showLogSearchBtn: props.showLogSearchBtn});
  }
  fetchData(stormClusterId) {
    ClusterREST.getStormViewUrl(stormClusterId).then((obj) => {
      if (obj.url) {
        this.setState({stormViewUrl: obj.url});
      }
    });
  }
  getLogLevel() {
    ViewModeREST.getTopologyLogConfig(this.props.topologyId).then((result)=>{
      if(result.responseMessage == undefined){
        if(moment(result.epoch).diff(moment()) >= 0) {
          this.setState({logLevel: result.logLevel});
          this.setTimer(result.epoch);
        }
      }
    });
  }
  changeLogLevel = (value) => {
    this.setState({logLevel: value});
  }
  changeLogDuration = (value) => {
    this.setState({durationSecs: value});
  }
  changeSampling = (value) => {
    this.setState({sampling: value});
  }
  toggleLogLevelDropdown = (isOpen) => {
    let {logLevel, durationSecs} = this.state;
    if(!isOpen && logLevel !== 'None' && durationSecs > 0) {
      ViewModeREST.postTopologyLogConfig(this.props.topologyId, logLevel, durationSecs)
      .then((res)=>{
        if(res.epoch) {
          clearInterval(this.intervalId);
          this.setTimer(res.epoch);
        }
      });
    }
  }
  setTimer(epochTime) {
    var interval = 1000;
    var logLevel = this.state.logLevel;
    var durationSecs = this.state.durationSecs;
    this.intervalId = setInterval(function(){
      var currentTime = moment();
      var leftTime = moment.duration(moment(epochTime).diff(currentTime));
      var minutes = leftTime.minutes();
      var seconds = leftTime.seconds();
      if(minutes == 0 && seconds == 0) {
        clearInterval(this.intervalId);
        logLevel = 'None';
        durationSecs = 0;
      }
      this.setState({displayTime: minutes+':'+seconds, logLevel: logLevel, durationSecs: durationSecs});
    }.bind(this), interval);
  }
  changeMode = (value) => {
    this.setState({selectedMode: value});
    this.props.modeSelectCallback(value);
  }
  handleSelectVersion(eventKey, event) {
    let versionId = event.target.dataset.versionId;
    this.props.handleVersionChange(versionId);
  }
  getTitleFromId(id) {
    if (id && this.props.versionsArr != undefined) {
      let obj = this.props.versionsArr.find((o) => {
        return o.id == id;
      });
      if (obj) {
        return obj.name;
      }
    } else {
      return '';
    }
  }

  render() {
    let {stormViewUrl, startDate, endDate, ranges, rangesInHoursMins, rangesInDaysToYears, rangesPrevious, displayTime, showLogSearchBtn} = this.state;
    const {
      topologyId,
      topologyName,
      isAppRunning,
      unknown,
      killTopology,
      setCurrentVersion,
      topologyMetric,
      timestamp,
      topologyVersion,
      versionsArr = [],
      allACL
    } = this.props;

    const {metric} = topologyMetric || {
      metric: (topologyMetric === '')
        ? ''
        : topologyMetric.metric
    };
    const metricWrap = metric;
    const {misc} = metricWrap || {
      misc: (metricWrap === '')
        ? ''
        : metricWrap.misc
    };
    const latencyText = Utils.secToMinConverter(metric.latency, "graph").split('/');
    const emittedText = Utils.kFormatter(misc.emitted).toString();
    const transferred = Utils.kFormatter(misc.transferred).toString();
    let versionName = this.getTitleFromId(topologyVersion);

    if (topologyMetric && topologyMetric.runtimeTopologyId && stormViewUrl.length) {
      if (stormViewUrl.indexOf('/main/views/') == -1) {
        stormViewUrl = stormViewUrl + '/topology.html?id=' + topologyMetric.runtimeTopologyId;
      } else {
        //Storm view requires the path to be encoded
        stormViewUrl = stormViewUrl + '?viewpath=%23!%2Ftopology%2F' + encodeURIComponent(topologyMetric.runtimeTopologyId);
      }
    }
    const userInfo = app_state.user_profile !== undefined ? app_state.user_profile.admin : false;
    let permission=true, aclObject={};
    if(app_state.streamline_config.secureMode){
      aclObject = findSingleAclObj(topologyId, allACL || []);
      const {p_permission} = handleSecurePermission(aclObject,userInfo,"Applications");
      permission = p_permission;
    }
    const locale = {
      format: 'YYYY-MM-DD',
      separator: ' - ',
      applyLabel: 'OK',
      cancelLabel: 'Cancel',
      weekLabel: 'W',
      customRangeLabel: 'Custom Range',
      daysOfWeek: moment.weekdaysMin(),
      monthNames: moment.monthsShort(),
      firstDay: moment.localeData().firstDayOfWeek()
    };
    let labelStart = this.state.startDate.format('YYYY-MM-DD HH:mm:ss');
    let labelEnd = this.state.endDate.format('YYYY-MM-DD HH:mm:ss');

    const titleContent = (
      <span>All Components &emsp; {displayTime == '0:0' ? '' : (<span>Timer: <span style={{color: '#d06831'}}>{displayTime}</span> &emsp; </span>)}Log: <span style={{color: '#2787ad'}}>{_.capitalize(this.state.logLevel)}</span> &emsp; {/*Sampling: <span style={{color: '#2787ad'}}>{this.state.sampling}%</span>*/}</span>
    );
    const datePickerTitleContent = (
      <span><i className="fa fa-clock-o"></i> {moment.duration(startDate.diff(endDate)).humanize()}</span>
    );

    return (
      <div>
        <div className="view-mode-title-box row">
          <div className="col-sm-4">
            <DropdownButton title={titleContent}
              id="log-duration-dropdown"
              disabled={!isAppRunning}
              onToggle={this.toggleLogLevelDropdown}
              pullRight
            >
              <label>Log Level</label>
              <ToggleButtonGroup type="radio" name="log-level-options" value={this.state.logLevel} onChange={this.changeLogLevel}>
                <ToggleButton className="log-level-btn left" value="TRACE">TRACE</ToggleButton>
                <ToggleButton className="log-level-btn" value="DEBUG">DEBUG</ToggleButton>
                <ToggleButton className="log-level-btn" value="INFO">INFO</ToggleButton>
                <ToggleButton className="log-level-btn" value="WARN">WARN</ToggleButton>
                <ToggleButton className="log-level-btn right" value="ERROR">ERROR</ToggleButton>
              </ToggleButtonGroup>
              <label>Duration</label>
              <ToggleButtonGroup type="radio" name="duration-options" value={this.state.durationSecs} onChange={this.changeLogDuration}>
                <ToggleButton className="duration-btn left" value={5}>5s</ToggleButton>
                <ToggleButton className="duration-btn" value={10}>10s</ToggleButton>
                <ToggleButton className="duration-btn" value={15}>15s</ToggleButton>
                <ToggleButton className="duration-btn" value={30}>30s</ToggleButton>
                <ToggleButton className="duration-btn" value={60}>1m</ToggleButton>
                <ToggleButton className="duration-btn" value={600}>10m</ToggleButton>
                <ToggleButton className="duration-btn right" value={3600}>1h</ToggleButton>
              </ToggleButtonGroup>
              {/*<label>Sampling Percentage</label>
              <ToggleButtonGroup type="radio" name="sampling-options" value={this.state.sampling} onChange={this.changeSampling}>
              <ToggleButton className="sampling-btn left" value={0}>0</ToggleButton>
              <ToggleButton className="sampling-btn" value={1}>1</ToggleButton>
              <ToggleButton className="sampling-btn" value={5}>5</ToggleButton>
              <ToggleButton className="sampling-btn" value={10}>10</ToggleButton>
              <ToggleButton className="sampling-btn" value={15}>15</ToggleButton>
              <ToggleButton className="sampling-btn" value={20}>20</ToggleButton>
              <ToggleButton className="sampling-btn right" value={30}>30</ToggleButton>
              </ToggleButtonGroup>*/}
            </DropdownButton>
          </div>
          {/*<div className="col-sm-3">
            <div className="filter-label">
              <span className="text-muted">Version:</span>
              <DropdownButton bsStyle="link" title={versionName || ''} pullRight id="version-dropdown" onSelect={this.handleSelectVersion.bind(this)} >
                {versionsArr.map((v, i) => {
                  return <MenuItem active={versionName === v.name ? true : false} eventKey={i} key={i} data-version-id={v.id}>{v.name}</MenuItem>;
                })
              }
              </DropdownButton>
            </div>
          </div>*/}
          <div className="col-sm-4 text-right">
            <div>
              <span className="text-muted">Mode: </span>
                <ToggleButtonGroup type="radio" name="mode-select-options" defaultValue={this.state.selectedMode} onChange={this.changeMode}>
                  <ToggleButton className="mode-select-btn left" disabled={!isAppRunning} value="Overview">OVERVIEW</ToggleButton>
                  <ToggleButton className="mode-select-btn right" disabled={!isAppRunning} value="Metrics">METRICS</ToggleButton>
                  {/*<ToggleButton className="mode-select-btn right" disabled={!isAppRunning} value="Sample">SAMPLE</ToggleButton>*/}
              </ToggleButtonGroup>
            </div>
          </div>
          <div className="pull-right">
            {versionName.toLowerCase() == 'current'
              ? [
                permission ? <Link style={{marginLeft: '10px', marginRight: '10px'}} key={2} className="hb xl success" to={`applications/${topologyId}/edit`}><i className="fa fa-pencil"></i></Link> : null]
            :
              <OverlayTrigger placement="bottom" overlay={<Tooltip id="tooltip">Set this version as current version. If another version of topology is deployed, kill it first to set this one.</Tooltip>}>
                <div style={{display: 'inline-block', cursor: 'not-allowed'}}>
                  <button
                    type="button"
                    className="btn btn-default"
                    onClick={setCurrentVersion}
                    disabled={isAppRunning}
                    style={isAppRunning ? {pointerEvents : 'none'} : {}}>
                    Set Current Version
                  </button>
                </div>
              </OverlayTrigger>}
          </div>
          {showLogSearchBtn ?
            <div className="pull-right">
              <Link style={{marginLeft: '10px', top: '5px'}} key={3}
                className="hb sm default-blue"
                to={`logsearch/${topologyId}`}
              >
                <i className="fa fa-book"></i>
              </Link>
            </div>
          : null}
          <div className="pull-right" style={{marginLeft: '10px'}}>
            <DateTimePickerDropdown
              dropdownId="datepicker-dropdown"
              startDate={startDate}
              endDate={endDate}
              locale={locale}
              isDisabled={!isAppRunning}
              datePickerCallback={this.props.datePickerCallback} />
          </div>
          <div className="pull-right">
            {stormViewUrl.length
            ? <a href={stormViewUrl} target="_blank" className="btn btn-default"><img src="styles/img/storm-btn.png" width="20"/></a>
            : null}
          </div>
        </div>
      </div>
    );
  }
}

export default TopologyViewMode;
